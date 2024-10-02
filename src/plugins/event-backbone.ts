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

export class EventsBackboneSpine implements EventsBackboneSpineInterface {
    private readonly evntsTree: EventsRegistry;
    private readonly lstnrsRegistry: ListenersRegistry;
    private readonly compsRegistry: RegisteredComponentsRegistry;
    private readonly listenAllSymbol: Symbol = Symbol('*');

    constructor() {
        this.evntsTree = new Map();
        this.lstnrsRegistry = new Map();
        this.compsRegistry = new Map();
    }

    private _getComponentFromUid(uid: number): ComponentInternalInstance | undefined {
        const compKeys = this.compsRegistry.keys();
        for(const c of compKeys) {
            if(c.uid === uid) {
                return c;
            }
        }
        return undefined;
    }

    private _callHandler(h: EventsBackboneEventHandler, be: EventsBackboneSpineEvent, cs: Symbol, hOpts?: EventsBackboneSpineEntryOption): any {
        let once = null;
        be.stopPropagation = () => {
             be.propagationStopped = !be.global;
        };
        be.once = () => {
            once = true;
        };
        const oeName = this._rebuildEventNameFromSymbol(cs); // perchè ora con la gerarchia magari stiamo gestendo un evento di un livello diverso
        const cName = be.handlerCallerComponentInstance?.type?.__name || be.handlerCallerComponentInstance?.type?.name;
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
        if (Object.is(once, null) && hOpts?.once) {
            try {
                if (typeof hOpts.once === 'function' ? hOpts.once(be) : hOpts.once) {
                    this.off(be.handlerCallerComponentInstance.uid, oeName || "-", h);
                }
            } catch (e: any) {
                console.error(`Error in once option for handler function: ${h?.name} - event: ${oeName} - handler caller: ${cName}`);
                console.error(e);
            }
        } else if(once) {
            this.off(be.handlerCallerComponentInstance.uid, oeName || "-", h);
        }
        return retval;
    }

    // manages handlers when global has been set to true when event was emitted
    private async _internalEmitGlobalEvent(bEvt: EventsBackboneSpineEvent): Promise<void> {
        let defs: Promise<any>[] = [];
        bEvt.branchSymbols.forEach((s: Symbol) => {
            const compListeners = this.lstnrsRegistry.get(s);
            if(compListeners) {
                for(const cl of compListeners.entries()) {
                    bEvt.handlerCallerComponentInstance = cl[0];
                    const handlers = cl[1].entries();
                    for (const h of handlers) {
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
    }

    private async _internalEmitEvent(bEvt: EventsBackboneSpineEvent, callerCInst?: ComponentInternalInstance): Promise<void> {
        bEvt.handlerCallerComponentInstance = callerCInst || bEvt.emitterComponentInstance;
        const compSymbs = this.compsRegistry.get(bEvt.handlerCallerComponentInstance);
        if(compSymbs) {
            let defs: Promise<any>[] = [];
            bEvt.branchSymbols.forEach((s: Symbol) => {
                if(compSymbs.has(s)) {
                    const compListeners = this.lstnrsRegistry.get(s);
                    if(compListeners) {
                        const listeners = compListeners.get(bEvt.handlerCallerComponentInstance);
                        if(listeners) {
                            for (const hand of listeners.entries()) {
                                let returnedFromHandler = this._callHandler(
                                    hand[0],
                                    bEvt,
                                    s,
                                    hand[1],
                                );
                                if((!bEvt.eager) && returnedFromHandler instanceof Promise) {
                                    defs.push(returnedFromHandler);
                                }
                            }
                        }
                    }
                }
            })
            await Promise.allSettled(defs);
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
            const evEntry = this._findEventEntry(rn);
            if(!evEntry) {
                break;
            }
            a.unshift(evEntry.symbol);
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
            stopPropagation: () => {},
            once: () => {},
            transformEvent: function (nn: string, nd?: any) {
                if(this.global) {
                    console.warn(`Cannot transform event ${this.eventName} into ${nn} as ${this.eventName} was emitted globally.`);
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
            }
        }
        bEvt.transformEvent = bEvt.transformEvent.bind(bEvt); // ensure this reference
        if(configs?.global) {
          return this._internalEmitGlobalEvent(bEvt);
        }
        return this._internalEmitEvent(bEvt);
    }

    private _addEventEntry(eName: string, subEntry?: EventsRegistryEntry): EventsRegistryEntry {
        const newEntry: EventsRegistryEntry = { symbol: eName === '*' ? this.listenAllSymbol : Symbol(eName), parent: subEntry, children: new Map() };
        if(subEntry) {
            subEntry.children.set(eName, newEntry);
            return newEntry;
        }
        this.evntsTree.set(eName, newEntry);
        return newEntry;
    }

    private _checkEventEntryValidity(ee: EventsRegistryEntry): boolean {
        const hasHandlers = !!this.lstnrsRegistry.get(ee.symbol);
        if(hasHandlers || ee.children.size === 0) {
            return hasHandlers;
        }
        const children = ee.children.entries();
        for(const c of children) {
            if(this._checkEventEntryValidity(c[1])) {
                return true;
            }
        }
        return hasHandlers;
    }

    private _removeEventEntry(toDelEntry: EventsRegistryEntry) {
        if(!toDelEntry) {
            return;
        }
        let parentEntry = toDelEntry.parent;
        if(!parentEntry) {
            this.evntsTree.delete(toDelEntry.symbol.description as string);
            return;
        }
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
        if(!foundEventEntry) {
            return undefined;
        }
        return this._rebuildEventNameFromEventEntry(foundEventEntry);
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
        return undefined
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

    private _findEventEntry(eName: string, update?: boolean): EventsRegistryEntry | undefined {
        return this._getEventEntry(eName.split(":"), undefined, update);
    }

    private _checkEventNameValidity(en: string) {
        const reg = /(?<listenallerror>.*\*.+)|(?<consequentcolons>:{2,})|(?<spacescolons>:\s+:)|(?<finalcolon>^.*:$)|(?<startingcolon>^:.*$)/gi;
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
    }

    // da chiamare nell' ON
    private _addListener(c: ComponentInternalInstance, eName: string, h: EventsBackboneEventHandler, opts?: EventsBackboneSpineEntryOption) {
        const testEntry = this._findEventEntry(eName, true);
        // testEntry ci sarà sicuramente anche se va controllato
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
            listenersEntries.set(c, new Map)
            const cListeners = listenersEntries.get(c);
            if(!cListeners) {
                listenersEntries.set(c, new Map([[h,opts]]));
            } else {
                cListeners.set(h, opts);
            }
        }
    }

    private _addCompEntrySymbol(c: ComponentInternalInstance, s: Symbol) {
        if(!this.compsRegistry.has(c)) {
            this.compsRegistry.set(c, new Set([s]));
            return;
        }
        this.compsRegistry.get(c)?.add(s);
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
        const testEntry = this._findEventEntry(eName);
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
                throw new Error("Event name can not be an empty string");
            }
            this._checkEventNameValidity(ev);
            this._addListener(c, ev, h, opts);
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
            this.offAll(uid);
        }
    }

    offAll(uid: number): void {
        const comp = this._getComponentFromUid(uid);
        if(comp) {
            const evSyms = this.compsRegistry.get(comp);
            if(evSyms) {
                evSyms.forEach((es: Symbol) => {
                    const componentHandlers = this.lstnrsRegistry.get(es);
                    if(componentHandlers && componentHandlers.has(comp)) {
                        componentHandlers.delete(comp);
                    }
                })
                this.compsRegistry.delete(comp);
            }
        }
    }
}

const EventsBackboneFactory = function(ctor: EventsBackboneSpineConstructor): EventsBackboneSpine {
    return new ctor();
}

export const BB: EventsBackboneSpine = EventsBackboneFactory(EventsBackboneSpine);

export const EventsBackBoneDirective: ObjectDirective<any, EventsBackboneDirectiveParams> = {
    mounted(el: HTMLElement, binding: DirectiveBinding, vnode: any) {
        const comp = binding.instance?.$;
        if(comp) {
            for (const eventKey in binding.value) {
                if(!Array.isArray(binding.value[eventKey])) {
                    console.warn(`${comp.type.__name || comp.type.name} - eventKey value for ${eventKey} must be an array`);
                } else {
                    for (const handlerParams of binding.value[eventKey]) {
                        BB.on(comp, eventKey, handlerParams.handler, handlerParams.options);
                    }
                }
            }
        }
    },
    beforeUpdate(el: HTMLElement, binding: DirectiveBinding, vnode: any, prevVnode: any) {
        const comp = binding.instance?.$;
        comp ? BB.offAll(comp.uid) : undefined;
        if(comp) {
            for (const eventKey in binding.value) {
                if(!Array.isArray(binding.value[eventKey])) {
                    console.warn(`${comp.type.__name || comp.type.name} - eventKey value for ${eventKey} must be an array`);
                } else {
                    for (const handlerParams of binding.value[eventKey]) {
                        BB.on(comp, eventKey, handlerParams.handler, handlerParams.options);
                    }
                }
            }
        }
    },
    beforeUnmount(el: HTMLElement, binding: DirectiveBinding, vnode: any) {
        const comp = binding.instance?.$;
        comp ? BB.offAll(comp.uid) : undefined;
    }
}