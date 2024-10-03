import type {App} from "vue";
import {
    createEventsBackboneEmitter as createEmitFunctionSymb, EventsBackboneEmitFn,
    EventsBackboneEmitter,
    EventsBackboneEmitters,
    installEventsBackbone
} from "./types";
import {getCurrentInstance} from "vue";
import {EventsBackBoneDirective as ebDir, BB, EventsBackboneSpine} from "./plugins/event-backbone.ts";

export const EventsBackBoneDirective = ebDir;
export const createEventsBackboneEmitter = createEmitFunctionSymb;

function createEmitterFunctions(evt: string): EventsBackboneEmitter;
function createEmitterFunctions(evt: Array<string>): EventsBackboneEmitters;
function createEmitterFunctions(evt: string | Array<string>): EventsBackboneEmitter | EventsBackboneEmitters {
    const cInstance = getCurrentInstance();
    if (!cInstance) {
        console.warn("No current component instance. createBackboneEmitter has to be called inside a lifecycle hook.");
    }
    if(evt instanceof Array) {
        const emitters: EventsBackboneEmitters = {};
        for(const e of evt) {
            emitters[e] = cInstance ? function <E>(data?: E, global?: boolean, eager?: boolean) {
                return BB.emitEvent<typeof data>(cInstance, e, data as typeof data, { global: global, eager: eager });
            } : <E>(data?: E, global?: boolean, eager?: boolean) => {
                console.warn("Default backbone emitter called. No event transmitted through the backbone.");
                return Promise.resolve();
            };
        }
        return emitters;
    }
    return (cInstance ? function <E>(data?: E, global?: boolean, eager?: boolean) {
        return BB.emitEvent<typeof data>(cInstance, evt, data as typeof data, { global: global, eager: eager });
    } : <E>(data?: E, global?: boolean, eager?: boolean) => {
        console.warn("Default backbone emitter called. No event transmitted through the backbone.");
        return Promise.resolve();
    }) as EventsBackboneEmitter;
}

export function defineBackboneEmits(evt?: string | Array<string>): EventsBackboneEmitFn {
    const cInstance = getCurrentInstance();
    if (!cInstance) {
        console.warn("No current component instance. createBackboneEmitter has to be called inside a lifecycle hook.");
        return (ev: string, data?: any, global?: boolean, eager?: boolean) => {
            console.warn(`Default backbone emitter called. Event ${ev} NOT emitted through the backbone.`);
            return Promise.resolve();
        };
    }
    if(!evt) {
        // generic emit, no event control
        return (ev: string, data?: any, global?: boolean, eager?: boolean) => {
            return BB.emitEvent(cInstance, ev, data, { global: global, eager: eager });
        };
    }
    let emitsMap: Map<string, EventsBackboneEmitter> = new Map();
    if(Array.isArray(evt)) {
        emitsMap = new Map(evt.map(
            (en: string) => {
                return [
                    en,
                    function (data?: any, global?: boolean, eager?: boolean) {
                        return BB.emitEvent(cInstance, en, data, { global: global, eager: eager });
                }]
            })
        )
    } else {
        emitsMap.set(evt, function (data?: any, global?: boolean, eager?: boolean) {
            return BB.emitEvent(cInstance, evt, data, { global: global, eager: eager });
        })
    }
    return function(e: string, data: any, global?: boolean, eager?: boolean): Promise<void> {
        const fn = emitsMap.get(e);
        if(fn) {
            return fn(data, global, eager);
        }
        console.warn(`Event ${e} not defined as backbone emitter.`);
        return Promise.resolve();
    }
}

// for a more subtle control, give access to instance of backbone
export function useBackbone(): EventsBackboneSpine {
    return BB;
}

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
