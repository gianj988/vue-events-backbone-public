import type {ComponentInternalInstance, DirectiveBinding, ObjectDirective} from 'vue'
import {
    EventsBackboneEventHandler,
    EventsBackboneSpineEntry,
    EventsBackboneSpineEntryOption, EventsBackboneSpineEntryOptions,
    EventsBackboneSpineEvent,
    EventsBackboneDirectiveParams, EventsBackboneSpineInterface
} from "../types";

export interface EventsBackboneSpineConstructor {
    new(): EventsBackboneSpine;
}


export class EventsBackboneSpine implements EventsBackboneSpineInterface {
    private readonly spine: { [key: number]: EventsBackboneSpineEntry };
    private readonly _internalComponentInstances: { [key: number]: any};
    private readonly _componentInstancesHandlerOpts: { [componentUid: number]: { [eventName:string]: EventsBackboneSpineEntryOptions }};

    constructor() {
        this.spine = {};
        this._internalComponentInstances = {};
        this._componentInstancesHandlerOpts = {};
    }

    checkKeys(obj: any): number {
      return Object.keys(obj).length;
    }

    private _normalizeHandlerName(handlerName: string): string {
        return handlerName.trim().replace(/\s+/g, "_");
    }

    // calls the handler managing the options
    // returns a boolean to handle stopPropagation
    private _callHandler(h: EventsBackboneEventHandler, be: EventsBackboneSpineEvent, handlerOptions?: EventsBackboneSpineEntryOption): boolean {
        let propagationStopped = null;
        let once = null;
        /*
        * add possibility to call (and set) stop propagation inside the handler for a "more natural" way to call stopPropagation
        * */
        be.stopPropagation = () => {
            propagationStopped = !be.global;
        };
        be.once = () => {
            once = true;
        };
        try {
            h(be);
        } catch (e: any) {
            console.error(e);
        }
        // handle stopPropagation option if not handled earlier
        if (Object.is(propagationStopped, null) && handlerOptions?.stopPropagation) {
            try {
                propagationStopped = typeof handlerOptions.stopPropagation === 'function' ?
                    (handlerOptions.stopPropagation(be) || propagationStopped) : (handlerOptions.stopPropagation || propagationStopped);
            } catch (e: any) {
                console.error(e);
            }
        }
        // handle once option if not handled earlier
        if (Object.is(once, null) && handlerOptions?.once) {
            try {
                if (typeof handlerOptions.once === 'function' ? handlerOptions.once(be) : handlerOptions.once) {
                    this.off(be.handlerCallerComponentInstance.uid, be.eventName, h);
                }
            } catch (e: any) {
                console.error(e);
            }
        } else if(once) {
            this.off(be.handlerCallerComponentInstance.uid, be.eventName, h);
        }
        return !!propagationStopped;
    }

    // manages handlers when global has been set to true when event was emitted
    private _internalEmitGlobalEvent(backboneEvent: EventsBackboneSpineEvent): void {
      for(const ci in this._internalComponentInstances) {
        backboneEvent.handlerCallerComponentInstance = this._internalComponentInstances[ci];
        if(this.spine[backboneEvent.handlerCallerComponentInstance.uid]?.registeredHandlers[backboneEvent.eventName]) {
          for (const hand of this.spine[backboneEvent.handlerCallerComponentInstance.uid].registeredHandlers[backboneEvent.eventName]) {
            this._callHandler(
              hand,
              backboneEvent,
              this._getEventHandlerOpts(
                backboneEvent.handlerCallerComponentInstance.uid,
                backboneEvent.eventName,
                this._normalizeHandlerName(hand.name)
              )
            )
          }
        }
      }
    }

    /*
    * internal function that effectively propagates and calls handlers on the components chain
    * if registered
    * @backboneEvent information of events: original emitter component instance,
    * component owner of the registered event handler, event name and event data
    */
    private _internalEmitEvent(backboneEvent: EventsBackboneSpineEvent): void {
        let propagationStopped = false;
        if (this.spine[backboneEvent.handlerCallerComponentInstance.uid]?.registeredHandlers[backboneEvent.eventName]) {
          for (const hand of this.spine[backboneEvent.handlerCallerComponentInstance.uid].registeredHandlers[backboneEvent.eventName]) {
            propagationStopped = propagationStopped || this._callHandler(
              hand,
              backboneEvent,
              this._getEventHandlerOpts(
                backboneEvent.handlerCallerComponentInstance.uid,
                backboneEvent.eventName,
                this._normalizeHandlerName(hand.name)
              )
            )
          }
        }
        if (propagationStopped) {
          return;
        }
        if (backboneEvent.handlerCallerComponentInstance.parent) {
            backboneEvent.handlerCallerComponentInstance = backboneEvent.handlerCallerComponentInstance.parent;
            this._internalEmitEvent(backboneEvent);
        }
    }

    /*
    * function that effectively propagates an event through the entire branch
    * starting from the component that calls this function.
    * currentInstance is needed for 1) the uid to get event handlers registered for a specific event
    * 2) get the parent and propagate
    * @currentInstance: ComponentInternalInstance component internal instance
    * @ev: string te event name
    * @data?: any data to pass to handlers of the components chain
    * @global?: if event has to be emitted to all components that registered at least a handler for that event
    */
    async emitEvent(currentInstance: ComponentInternalInstance, ev: string, data?: any, global?: boolean): Promise<void> {
        const backboneEv: EventsBackboneSpineEvent = {
            emitterComponentInstance: currentInstance,
            handlerCallerComponentInstance: currentInstance,
            eventName: ev,
            eventData: data,
            global: global,
            // placeholders to avoid the optional parameters in type definition
            stopPropagation: () => {},
            once: () => {}
        }
        if(global) {
          this._internalEmitGlobalEvent(backboneEv);
          return;
        }
        this._internalEmitEvent(backboneEv);
        return;
    }

    // if existing, gets event handler options for specific component instance, event and handler
    private _getEventHandlerOpts(uid: number, eventName: string, handlerName: string): EventsBackboneSpineEntryOption | undefined {
      if(!this._componentInstancesHandlerOpts[uid]) {
        return undefined;
      }
      const componentInstanceEventHandlersopts = this._componentInstancesHandlerOpts[uid];
      if(!componentInstanceEventHandlersopts[eventName]) {
        return undefined;
      }
      const handlerOpts = componentInstanceEventHandlersopts[eventName];
      if(!handlerOpts[this._normalizeHandlerName(handlerName)]) {
        return undefined;
      }
      return handlerOpts[this._normalizeHandlerName(handlerName)];
    }

    // function to consistently add handler options for specific event and component instance
    private _addHandlerOptions(uid: number, eventName: string, handler: (backboneEvent: EventsBackboneSpineEvent) => void, options?: EventsBackboneSpineEntryOption): void {
        if(!this._componentInstancesHandlerOpts[uid]) {
          this._componentInstancesHandlerOpts[uid] = {};
        }
        if (!this._componentInstancesHandlerOpts[uid][eventName]) {
            this._componentInstancesHandlerOpts[uid][eventName] = {};
        }
        if(options) {
          const eventopts = this._componentInstancesHandlerOpts[uid][eventName];
          eventopts[this._normalizeHandlerName(handler.name)] = options;
        }
    }

    // remove options for a specific component instance, specific event and specific handler
    private _removeHandlerOptions(uid: number, eventName: string, handler: (backboneEvent: EventsBackboneSpineEvent) => void): void {
        if (!this._componentInstancesHandlerOpts[uid]) {
            return;
        }
        // instance all events options
        const instanceHandlerOpts = this._componentInstancesHandlerOpts[uid];
        if (!instanceHandlerOpts[eventName]) {
            return;
        }
        // instance specific event options
        const eventOptions = instanceHandlerOpts[eventName];
        if(!eventOptions[this._normalizeHandlerName(handler.name)]) {
          return;
        }
        delete eventOptions[this._normalizeHandlerName(handler.name)];
        // if no other handler options exist for specified event
        // remove event key from the instance options
        if(this.checkKeys(eventOptions) === 0) {
          this._removeAllEventOptions(uid, eventName);
        }
    }

    // remove options for a specific component instance and specific event
    private _removeAllEventOptions(uid: number, eventName: string): void {
        if (!this._componentInstancesHandlerOpts[uid]) {
            return;
        }
        // instance all events options
        const instanceHandlerOpts = this._componentInstancesHandlerOpts[uid];
        if (!instanceHandlerOpts[eventName]) {
            return;
        }
        delete instanceHandlerOpts[eventName];
        if(this.checkKeys(instanceHandlerOpts) === 0) {
          this._removeAllHandlerOptions(uid);
        }
    }

    // removes all event handlers options for specified component instance
    private _removeAllHandlerOptions(uid: number): void {
      if (!this._componentInstancesHandlerOpts[uid]) {
        return;
      }
      delete this._componentInstancesHandlerOpts[uid];
    }

    private _registerComponentInstance(ci: ComponentInternalInstance): void {
      if(!this._internalComponentInstances[ci.uid]) {
        this._internalComponentInstances[ci.uid] = ci;
      }
    }

    private _unregisterComponentInstance(uid: number): void {
      if(this._internalComponentInstances[uid]) {
        delete this._internalComponentInstances[uid];
      }
    }

    on(componentInstance: ComponentInternalInstance, ev: string, h: EventsBackboneEventHandler, opts?: EventsBackboneSpineEntryOption): void {
      const uid = componentInstance.uid;
      if (this.spine[uid]) {
          if (!this.spine[uid].registeredHandlers[ev]) {
              this.spine[uid].registeredHandlers[ev] = new Set();
          }
      } else {
        this._registerComponentInstance(componentInstance);
        this.spine[uid] = {
            uid: uid,
            registeredHandlers: {}
        }
        this.spine[uid].registeredHandlers[ev] = new Set();
      }
      this.spine[uid].registeredHandlers[ev].add(h);
      this._addHandlerOptions(uid, ev, h, opts)
    }

    // removes specific component instance handler for specific event
    // if no handler is passed to the function, it removes all handlers for specific events
    off(uid: number, ev: string, h?: EventsBackboneEventHandler): void {
      if (this.spine[uid]) {
        if(!h) {
          if(!this.spine[uid].registeredHandlers[ev]) {
            return;
          }
          delete this.spine[uid].registeredHandlers[ev];
          this._removeAllEventOptions(uid, ev);
        } else {
          if (this.spine[uid].registeredHandlers[ev] && this.spine[uid].registeredHandlers[ev].has(h)) {
            this.spine[uid].registeredHandlers[ev].delete(h);
            if(this.spine[uid].registeredHandlers[ev].size === 0) {
              delete this.spine[uid].registeredHandlers[ev];
            }
            this._removeHandlerOptions(uid, ev, h);
          }
        }
        if(this.checkKeys(this.spine[uid].registeredHandlers) === 0) {
          this.offAll(uid);
        }
      }
    }

    offAll(uid: number): void {
      if (this.spine[uid]) {
        delete this.spine[uid];
        this._removeAllHandlerOptions(uid);
        this._unregisterComponentInstance(uid);
      }
    }
}

const EventsBackboneFactory = function(ctor: EventsBackboneSpineConstructor): EventsBackboneSpine {
    return new ctor();
}

export const BB: EventsBackboneSpine = EventsBackboneFactory(EventsBackboneSpine);

export const EventsBackBoneDirective: ObjectDirective<any, EventsBackboneDirectiveParams> = {
    mounted(el: HTMLElement, binding: any, vnode: any) {
        for (const eventKey in binding.value) {
            if(!Array.isArray(binding.value[eventKey])) {
                console.warn(`${vnode?.ctx?.type.__name} - eventKey value for ${eventKey} must be an array`);
            } else {
                for (const handlerParams of binding.value[eventKey]) {
                    BB.on(vnode.ctx, eventKey, handlerParams.handler, handlerParams.options);
                }
            }
        }
    },
    beforeUpdate(el: HTMLElement, binding: DirectiveBinding, vnode: any, prevVnode: any) {
      BB.offAll(prevVnode.ctx.uid);
      for (const eventKey in binding.value) {
          if(!Array.isArray(binding.value[eventKey])) {
              console.warn(`${vnode?.ctx?.type.__name} - eventKey value for ${eventKey} must be an array`);
          } else {
              for (const handlerParams of binding.value[eventKey]) {
                  BB.on(vnode.ctx, eventKey, handlerParams.handler, handlerParams.options);
              }
          }
      }
    },
    beforeUnmount(el: HTMLElement, binding: DirectiveBinding, vnode: any) {
        BB.offAll(vnode.ctx.uid);
    }
}