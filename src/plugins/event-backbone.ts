import type {ComponentInternalInstance, DirectiveBinding, ObjectDirective} from 'vue'
import {
    EventsBackboneEventHandler,
    EventsBackboneSpineEntryOption,
    EventsBackboneSpineEvent,
    EventsBackboneDirectiveParams, EventsBackboneSpineInterface
} from "../types";

declare interface EventsBackboneSpineConstructor {
    new(): EventsBackboneSpine;
}

declare interface EventsRegistryEntry {
    symbol: Symbol
    children: Map<string, EventsRegistryEntry>
    parent?: EventsRegistryEntry
}

type EventsRegistry = Map<string, EventsRegistryEntry>

type ComponentListenersRegistry = Map<EventsBackboneEventHandler, EventsBackboneSpineEntryOption | undefined>

type ListenersRegistry = Map<Symbol, Map<ComponentInternalInstance, ComponentListenersRegistry>>

type RegisteredComponentsRegistry = Map<ComponentInternalInstance, Set<Symbol>>

declare type dopedComponentInternalInstance = ComponentInternalInstance & {
    watchedIsUnmounted: boolean
    isUnmountedCallbacks: Array<() => void>
}

const dopeComponentInstance = function(c: ComponentInternalInstance): dopedComponentInternalInstance {
    c = Object.defineProperties(c, {
        watchedIsUnmounted: {
            enumerable: true,
            writable: true,
            value: c.isUnmounted
        },
        isUnmountedCallbacks: {
            enumerable: true,
            writable: true,
            value: [] as Array<() => void>
        }
    })
    return Object.defineProperty(c, "isUnmounted", {
        get() { return this.watchedIsUnmounted },
        set(v: boolean) {
          if(v !== this.watchedIsUnmounted) {
              try {
                  for(const ucb of this.isUnmountedCallbacks) {
                      ucb();
                  }
                  this.isUnmountedCallbacks.length = 0;
              } catch(e: any) {
                  console.error(e);
              }
          }
          this.watchedIsUnmounted = v;
        }
    }) as dopedComponentInternalInstance;
}

export class EventsBackboneSpine implements EventsBackboneSpineInterface {
    private readonly evntsTree: EventsRegistry;
    private readonly lstnrsRegistry: ListenersRegistry;
    private readonly compsRegistry: RegisteredComponentsRegistry;
    private readonly listenAllSymbol: Symbol = Symbol('*');
    private readonly emptyMap: Map<any, any> = new Map();

    constructor() {
        this.evntsTree = new Map();
        this.lstnrsRegistry = new Map();
        this.compsRegistry = new Map();
    }

    private _getComponentFromUid(uid: number): ComponentInternalInstance | undefined {
        for(const c of this.compsRegistry.entries()) {
            if(c[0].uid === uid) {
                return c[0];
            }
        }
        return undefined;
    }

    private _callHandler(h: EventsBackboneEventHandler, be: EventsBackboneSpineEvent, cs: Symbol, hOpts?: EventsBackboneSpineEntryOption): any {
        const oeName = this._rebuildEventNameFromSymbol(cs);
        const cName = be.handlerCallerComponentInstance?.type?.__name || be.handlerCallerComponentInstance?.type?.name;
        be.once = () => {
            this.off(be.handlerCallerComponentInstance.uid, oeName || "-", h);
        };
        let retval;
        try {
            retval = h(be);
        } catch (e: any) {
            console.error(`Error in handler function: ${h?.name} - event: ${oeName} - handler caller: ${cName}`);
            console.error(e);
            return e;
        }
        // handle stopPropagation option if not handled earlier
        if (Object.is(be.propagationStopped, null) && hOpts?.stopPropagation) {
            try {
                 be.propagationStopped = typeof hOpts.stopPropagation === 'function' ?
                    hOpts.stopPropagation(be) : hOpts.stopPropagation;
            } catch (e: any) {
                console.error(`Error in stopPropagation option for handler function: ${h?.name} - event: ${oeName} - handler caller: ${cName}`);
                console.error(e);
            }
        }
        // handle once option if not handled earlier
        if (hOpts?.once) {
            try {
                if (typeof hOpts.once === 'function' ? hOpts.once(be) : hOpts.once) {
                    this.off(be.handlerCallerComponentInstance.uid, oeName || "-", h);
                }
            } catch (e: any) {
                console.error(`Error in once option for handler function: ${h?.name} - event: ${oeName} - handler caller: ${cName}`);
                console.error(e);
            }
        }
        return retval;
    }

    private async _callHandlers(bEvt: EventsBackboneSpineEvent, comp?: ComponentInternalInstance): Promise<void>{
        const defs: Promise<any>[] = [];
        bEvt.branchSymbols.forEach((s: Symbol) => {
            for(const cl of (this.lstnrsRegistry.get(s) || this.emptyMap).entries()) {
                const cInstance = comp ? (comp.uid === cl[0].uid ? comp : undefined) : cl[0];
                if(cInstance) {
                    bEvt.handlerCallerComponentInstance = cInstance;
                    for (const h of cl[1].entries()) {
                        let returnedFromHandler = this._callHandler(
                            h[0],
                            bEvt,
                            s,
                            h[1],
                        )
                        if((!bEvt.eager) && returnedFromHandler instanceof Promise) {
                            defs.push(returnedFromHandler);
                        }
                    }
                }
            }
        });
        await Promise.allSettled(defs);
        return;
    }

    private async _internalEmitEvent(bEvt: EventsBackboneSpineEvent, callerCInst?: ComponentInternalInstance): Promise<void> {
        bEvt.handlerCallerComponentInstance = callerCInst || bEvt.emitterComponentInstance;
        if(this.compsRegistry.has(bEvt.handlerCallerComponentInstance)) {
            await this._callHandlers(bEvt, bEvt.handlerCallerComponentInstance);
        }
        if ((!bEvt.propagationStopped) && bEvt.handlerCallerComponentInstance.parent) {
            await this._internalEmitEvent(bEvt, bEvt.handlerCallerComponentInstance.parent);
        }
        return;
    }

    // get the reversed branch of event symbols a:b:c -> [c, b, a]
    private _getBranchSymbols(en: string): Array<Symbol> {
        const ens = en.split(":");
        const a: Array<Symbol> = [this.listenAllSymbol];
        let rn;
        while(ens.length > 0) {
            rn = rn ? rn + `:${ens.splice(0,1)[0]}` : `${ens.splice(0,1)[0]}`;
            const evEntry = this._getEventEntry(rn.split(":"));
            if(!evEntry) {
                break;
            } else {
                a.unshift(evEntry.symbol);
            }
        }
        return a;
    }

    // main function to handle emitted event
    emitEvent<T>(cInst: ComponentInternalInstance, ev: string, d?: T, configs?: { global?: boolean, eager?: boolean }): Promise<void> {
        const mainSelf = this;
        const bEvt: EventsBackboneSpineEvent = {
            emitterComponentInstance: cInst,
            handlerCallerComponentInstance: cInst,
            eventName: ev,
            branchSymbols: this._getBranchSymbols(ev),
            eventData: d,
            global: configs?.global || false,
            propagationStopped: null,
            eager: Object.is(configs?.eager, undefined) || Object.is(configs?.eager, null) ? true : !!configs?.eager || false,
            // placeholders to avoid the optional parameters in type definition
            stopPropagation: function () {
                if(!this.global) {
                    this.propagationStopped = !this.global;
                    return;
                }
                console.warn(`${this.eventName} - can not stop the propagation of an event emitted globally.`);
            },
            once: () => {},
            transformEvent: function (nn: string, nd?: any) {
                if(this.global) {
                    console.warn(`Cannot transform event ${this.eventName} into ${nn} as ${this.eventName} has been emitted globally.`);
                    return;
                }
                try {
                    mainSelf._checkEventNameValidity(nn);
                    this.eventName = nn;
                    this.eventData = nd || this.eventData;
                    this.branchSymbols = mainSelf._getBranchSymbols(nn);
                } catch(e: any) {
                    console.error(`Error trying to transform event ${this.eventName} into ${nn}`);
                    console.error(e);
                }
            },
            emitEvent: function(ev: string, data?: any, global?: boolean, eager?: false): Promise<void> {
                return mainSelf.emitEvent(this.handlerCallerComponentInstance, ev, data, { global, eager });
            }
        }
        bEvt.transformEvent = bEvt.transformEvent.bind(bEvt); // ensure this reference
        if(configs?.global) {
          return this._callHandlers(bEvt);
        }
        return this._internalEmitEvent(bEvt);
    }

    private _addEventEntry(eName: string, subEntry?: EventsRegistryEntry): EventsRegistryEntry {
        if(subEntry && eName !== '*') {
            return subEntry.children.set(eName, { symbol: Symbol(eName), parent: subEntry, children: new Map() }).get(eName) as EventsRegistryEntry;
        }
        return this.evntsTree.set(eName, { symbol: eName === '*' ? this.listenAllSymbol : Symbol(eName), parent: subEntry, children: new Map() }).get(eName) as EventsRegistryEntry;
    }

    private _checkEventEntryValidity(ee: EventsRegistryEntry): boolean {
        const hasHandlers = !!this.lstnrsRegistry.get(ee.symbol);
        if(hasHandlers || ee.children.size === 0) {
            return hasHandlers;
        }
        for(const c of ee.children.entries()) {
            if(this._checkEventEntryValidity(c[1])) {
                return true;
            }
        }
        return hasHandlers;
    }

    private _removeEventEntry(toDelEntry: EventsRegistryEntry) {
        let parentEntry = toDelEntry.parent;
        if(!parentEntry) {
            this.evntsTree.delete(toDelEntry.symbol.description as string);
            return;
        }
        toDelEntry.parent = undefined;
        parentEntry.children.delete(toDelEntry.symbol.description as string);
        while(parentEntry) {
            if(!this._checkEventEntryValidity(parentEntry)) {
                const parentEntryParentTemp: EventsRegistryEntry | undefined = parentEntry.parent;
                if(parentEntryParentTemp) {
                    parentEntry.parent = undefined;
                    parentEntryParentTemp.children.delete(parentEntry.symbol.description as string);
                } else {
                    this.evntsTree.delete(parentEntry.symbol.description as string)
                }
                parentEntry = parentEntryParentTemp;
            } else {
                break;
            }
        }
    }

    private _rebuildEventNameFromSymbol(s: Symbol) {
        const foundEventEntry = this._findEventEntryFromNodeName(s.description as string);
        if(foundEventEntry) {
            return this._rebuildEventNameFromEventEntry(foundEventEntry);
        }
    }

    private _rebuildEventNameFromEventEntry(ee: EventsRegistryEntry) {
        let name = ee.symbol.description;
        while (ee.parent) {
            name = `${ee.parent.symbol.description}:` + name;
            ee = ee.parent
        }
        return name;
    }

    private _findEventEntryFromNodeName(nn: string, subee?: EventsRegistryEntry): EventsRegistryEntry | undefined{
        if(subee) {
            for(const subc of subee.children.entries()) {
                if(subc[0] === nn) {
                    return subc[1];
                }
                const foundChild = this._findEventEntryFromNodeName(nn, subc[1]);
                if(foundChild) {
                    return foundChild;
                }
            }
            return undefined;
        }
        for(const ee of this.evntsTree.entries()) {
            if(ee[0] === nn) {
                return ee[1];
            }
            const foundChild = this._findEventEntryFromNodeName(nn, ee[1])
            if(foundChild) {
                return foundChild;
            }
        }
    }

    private _getEventEntry(gs: Array<string>, ee?: EventsRegistryEntry, update?: boolean): EventsRegistryEntry | undefined {
        const currentNodeName = gs.splice(0, 1)[0];
        let currentEntry = ee ? ee.children.get(currentNodeName) : this.evntsTree.get(currentNodeName);
        if(!currentEntry) {
            if(!update) {
                return currentEntry;
            }
            currentEntry = this._addEventEntry(currentNodeName, ee);
        }
        if(gs.length === 0) {
            return currentEntry;
        }
        return this._getEventEntry(gs, currentEntry, update);
    }

    private _checkEventNameValidity(en: string) {
        const reg = /(?<listenallerror>.*\*.+)|(?<consequentcolons>:{2,})|(?<spacescolons>:\s+:)|(?<finalcolon>^.*:$)|(?<startingcolon>^:.*$)|(?<spacesfound>^[a-zA-Z:]*\s+[a-zA-Z:]*$)/gi;
        const matches = reg.exec(en);
        if(matches?.groups?.listenallerror) {
            throw new Error(`${en} - Invalid event name. Listen All event listeners must be registered with a lone '*'.`);
        }
        if(matches?.groups?.consequentcolons) {
            throw new Error(`${en} - Invalid event name. The name cannot have consequent colons.`);
        }
        if(matches?.groups?.finalcolon) {
            throw new Error(`${en} - Invalid event name. The name cannot end with a colon.`);
        }
        if(matches?.groups?.startingcolon) {
            throw new Error(`${en} - Invalid event name. The name cannot start with a colon.`);
        }
        if(matches?.groups?.spacescolons) {
            throw new Error(`${en} - Invalid event name. The name cannot have two colons separated by spaces.`);
        }
        if(matches?.groups?.spacesfound) {
            throw new Error(`${en} - Invalid event name. The name cannot have spaces inside.`);
        }
    }

    // da chiamare nell' ON
    private _addListener(c: ComponentInternalInstance, eName: string, h: EventsBackboneEventHandler, opts?: EventsBackboneSpineEntryOption) {
        const testEntry = this._getEventEntry(eName.split(":"), undefined, true);
        if(testEntry) {
            this._addListenerEntry(c, testEntry.symbol, h, opts);
            this._addCompEntrySymbol(c, testEntry.symbol);
        }
    }

    private _addListenerEntry(c: ComponentInternalInstance, s: Symbol, h: EventsBackboneEventHandler, opts?: EventsBackboneSpineEntryOption) {
        const listenersEntries = this.lstnrsRegistry.get(s);
        if(!listenersEntries) {
            this.lstnrsRegistry.set(s, new Map([[c, new Map([[h, opts]])]]));
        } else {
            const cListeners = listenersEntries.get(c);
            if(cListeners) {
                !cListeners.has(h) ? cListeners.set(h, opts) : undefined;
                return;
            }
            listenersEntries.set(c, new Map([[h, opts]]));
        }
    }

    private _addCompEntrySymbol(c: ComponentInternalInstance, s: Symbol) {
        if(this.compsRegistry.has(c)) {
            this.compsRegistry.get(c)?.add(s);
            return;
        }
        this.compsRegistry.set(c, new Set([s]));
    }

    // remove functions

    private _removeCompEntry(c: ComponentInternalInstance) {
        this.compsRegistry.delete(c);
    }

    private _removeCompEntrySymbol(c: ComponentInternalInstance, s: Symbol) {
        const cSymbols = this.compsRegistry.get(c);
        if(!cSymbols) {
            return;
        }
        cSymbols.delete(s);
        if(cSymbols.size === 0) {
            this._removeCompEntry(c);
        }
    }

    private _removeListenerEntry(c: ComponentInternalInstance, s: Symbol, h: EventsBackboneEventHandler) {
        const listenersEntries = this.lstnrsRegistry.get(s);
        if(!listenersEntries) {
            return;
        }
        const cListeners = listenersEntries.get(c);
        if(!cListeners) {
            return;
        }
        cListeners.delete(h);
        if(cListeners.size === 0) {
            listenersEntries.delete(c);
            this._removeCompEntrySymbol(c, s);
        }
    }

    // da chiamare nell' OFF
    private _removeListener(c: ComponentInternalInstance, eName: string, h: EventsBackboneEventHandler) {
        const testEntry = this._getEventEntry(eName.split(":"));
        if(testEntry) {
            this._removeListenerEntry(c, testEntry.symbol, h);
            const listenersEntries = this.lstnrsRegistry.get(testEntry.symbol);
            if(listenersEntries && listenersEntries.size === 0) {
                this.lstnrsRegistry.delete(testEntry.symbol);
            }
            if(!this._checkEventEntryValidity(testEntry)) {
                this._removeEventEntry(testEntry);
            }
        }
    }

    on(c: ComponentInternalInstance, ev: string, h: EventsBackboneEventHandler, opts?: EventsBackboneSpineEntryOption): void {
        try {
            ev = ev.trim()
            if(ev.length === 0) {
                console.error("Event name can not be an empty string");
                return;
            }
            let dc = dopeComponentInstance(c);
            this._checkEventNameValidity(ev);
            this._addListener(dc, ev, h, opts);
            dc.isUnmountedCallbacks.push(() => {
                this.offAll(dc);
            })
        } catch(e: any) {
            console.error(e);
        }
    }

    // removes specific component instance handler for specific event
    // if no handler is passed to the function, it removes all handlers for specific events
    off(uid: number, ev: string, h?: EventsBackboneEventHandler): void {
        const comp = this._getComponentFromUid(uid);
        if(comp && h) {
            this._removeListener(comp, ev, h);
        } else if(comp && !h) {
            this.offAll(comp);
        }
    }

    offAll(c: ComponentInternalInstance): void {
        const evSyms = this.compsRegistry.get(c);
        if(evSyms) {
            evSyms.forEach((es: Symbol) => {
                const componentHandlers = this.lstnrsRegistry.get(es);
                if(componentHandlers && componentHandlers.has(c)) {
                    componentHandlers.delete(c);
                }
            })
            this.compsRegistry.delete(c);
        }
    }
}

const EventsBackboneFactory = function(ctor: EventsBackboneSpineConstructor): EventsBackboneSpine {
    return new ctor();
}

export const BB: EventsBackboneSpine = EventsBackboneFactory(EventsBackboneSpine);

export function removeAllEventBackboneListeners(comp?: ComponentInternalInstance) {
    comp ? BB.offAll(comp) : undefined;
}

export function removeEventListeners(dp: EventsBackboneDirectiveParams, comp?: ComponentInternalInstance) {
    if(comp) {
        for (const eventKey in dp) {
            if(!Array.isArray(dp[eventKey])) {
                console.warn(`${comp.type.__name || comp.type.name} - eventKey value for ${eventKey} must be an array`);
            } else {
                for (const handlerParams of dp[eventKey]) {
                    BB.off(comp.uid, eventKey, handlerParams.handler);
                }
            }
        }
    }
}

export function addEventBackboneListeners(dp: EventsBackboneDirectiveParams, comp?: ComponentInternalInstance, replace?: boolean) {
    removeAllEventBackboneListeners(replace && comp ? comp : undefined);
    if(comp) {
        for (const eventKey in dp) {
            if(Array.isArray(dp[eventKey])) {
                for (const handlerParams of dp[eventKey]) {
                    BB.on(comp, eventKey, handlerParams.handler, handlerParams.options);
                }
            } else {
                console.warn(`${comp.type.__name || comp.type.name} - eventKey value for ${eventKey} must be an array`);
            }
        }
    }
}

export const EventsBackBoneDirective: ObjectDirective<any, EventsBackboneDirectiveParams> = {
    beforeMount(el: HTMLElement, binding: DirectiveBinding, vnode: any) {
        addEventBackboneListeners(binding.value, binding.instance?.$);
    },
    beforeUpdate(el: HTMLElement, binding: DirectiveBinding, vnode: any, prevVnode: any) {
        addEventBackboneListeners(binding.value, binding.arg === 'update' && binding.instance?.$, binding.arg === 'update');
    },
    beforeUnmount(el: HTMLElement, binding: DirectiveBinding, vnode: any) {
        removeAllEventBackboneListeners(binding.instance?.$);
    }
}