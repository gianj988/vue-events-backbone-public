import type {App, ComponentInternalInstance} from "vue";

import {
    createEventsBackboneEmitter as createEmitFunctionSymb,
    EventsBackboneEmitter,
    EventsBackboneEmitters, EventsBackboneEmitFn,
    EventsBackboneAddListenerFn,
    EventsBackboneDirectiveParams, EventsBackboneRemoveListenerFn,
    installEventsBackbone
} from "./types";
import {getCurrentInstance} from "vue";
import {
    EventsBackBoneDirective as ebDir,
    BB,
    addEventBackboneListeners, removeEventListeners
} from "./plugins/event-backbone.ts";

export const createEventsBackboneEmitter = createEmitFunctionSymb;

function createEmitterFunctions(evt: string, c?: ComponentInternalInstance): EventsBackboneEmitter;
function createEmitterFunctions(evt: Array<string>, c?: ComponentInternalInstance): EventsBackboneEmitters;
function createEmitterFunctions(evt: string | Array<string>, c?: ComponentInternalInstance): EventsBackboneEmitter | EventsBackboneEmitters {
    const cInstance = c || getCurrentInstance();
    if(cInstance) {
        if(evt instanceof Array) {
            const emitters: EventsBackboneEmitters = {};
            for(const e of evt) {
                emitters[e] = function <E>(data?: E, global?: boolean, eager?: boolean) {
                    return BB.emitEvent<typeof data>(cInstance, e, data as typeof data, { global: global, eager: eager });
                };
            }
            return emitters;
        }
        return function <E>(data?: E, global?: boolean, eager?: boolean) {
            return BB.emitEvent<typeof data>(cInstance, evt, data as typeof data, { global: global, eager: eager });
        } as EventsBackboneEmitter;
    }
    console.warn("No current component instance. createBackboneEmitter has to be called inside a lifecycle hook or you have to pass a component instance to the function.");
    return function<E>(data?: E, global?: boolean, eager?: boolean) {
        console.warn("Default backbone emitter called. No event transmitted through the backbone.");
        return Promise.resolve();
    } as EventsBackboneEmitter;
}

export function defineRemoveEventListeners(c?: ComponentInternalInstance): EventsBackboneRemoveListenerFn {
    const cInstance = c || getCurrentInstance();
    if(cInstance) {
        return function(ls: EventsBackboneDirectiveParams) {
            removeEventListeners(ls, cInstance);
        }
    }
    return (ls: EventsBackboneDirectiveParams) => {
        const cInstance = getCurrentInstance();
        if(cInstance) {
            removeEventListeners(ls, cInstance);
            return;
        }
        console.warn(`Unable to retrieve component instance.
        Probably defineRemoveEventListeners has been called outside from a lifecycle hook, this means that at least this
        returned function must be called inside a lifecycle hook`);
    };
}

export function defineAddEventListeners(c?: ComponentInternalInstance): EventsBackboneAddListenerFn {
    const cInstance = c || getCurrentInstance();
    if(cInstance) {
        return function(ls: EventsBackboneDirectiveParams, replace?: true) {
            addEventBackboneListeners(ls, cInstance, replace);
        }
    }
    return (ls: EventsBackboneDirectiveParams, replace?: true) => {
        const cInstance = getCurrentInstance();
        if(cInstance) {
            addEventBackboneListeners(ls, cInstance, replace);
            return;
        }
        console.warn(`Unable to retrieve component instance.
        Probably defineAddEventListeners has been called outside from a lifecycle hook, this means that at least this
        returned function must be called inside a lifecycle hook`);
    };
}

export function defineBackboneEmits(evt?: Array<string>, c?: ComponentInternalInstance): EventsBackboneEmitFn {
    const cInstance = c || getCurrentInstance();
    if(cInstance) {
        if(evt) {
            // const eventsKeys = [...evt] as const;
            const emitsMap = new Map(evt.map(
                (en: string) => {
                    return [
                        en,
                        function (data?: any, global?: boolean, eager?: boolean) {
                            return BB.emitEvent(cInstance, en, data, { global: global, eager: eager });
                    }]
                })
            );
            return function(e: string, data: any, global?: boolean, eager?: boolean): Promise<void> {
                const fn = emitsMap.get(e as string);
                if(fn) {
                    return fn(data, global, eager);
                }
                console.warn(`Event ${e} not defined as backbone emitter.`);
                return Promise.resolve();
            }
        }
        // generic emit, no event control
        return function(e: string, data?: any, global?: boolean, eager?: boolean) {
            return BB.emitEvent(cInstance, e, data, { global: global, eager: eager });
        };
    }
    console.warn("No current component instance. defineBackboneEmits has to be called inside a lifecycle hook.");
    return (e: string, data?: any, global?: boolean, eager?: boolean) => {
        console.warn(`Default backbone emitter called. Event ${e} NOT emitted through the backbone.`);
        return Promise.resolve();
    };
}

// the Events Backbone Directive
export const EventsBackBoneDirective = ebDir;

// the plugin installer object
const eventsBackboneSpineInstaller: installEventsBackbone = {
    install: (app: App): void => {
        if (!app) {
            console.warn("No app parameter provided, returning...")
            return;
        }
        app.config.globalProperties.$EventsBackBone = BB;
        app.provide(createEventsBackboneEmitter, createEmitterFunctions);
    }
}
export default eventsBackboneSpineInstaller

// for a more subtle control, give access to instance of backbone
// export function useBackbone(): EventsBackboneSpine {
//     return BB;
// }