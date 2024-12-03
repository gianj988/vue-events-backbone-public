import type {App, ComponentInternalInstance} from "vue";

import {
    EventsBackboneEmitFn,
    EventsBackboneAddListenerFn,
    EventsBackboneDirectiveParams, EventsBackboneRemoveListenerFn,
    installEventsBackbone
} from "./types";
import {getCurrentInstance} from "vue";
import  { useBackboneBrain as UB, createNeuron as CN } from "./plugins/backbone-axon.ts";
import {
    EventsBackBoneDirective as ebDir,
    BB,
    addEventBackboneListeners, removeEventListeners, EventsBackboneSpine
} from "./plugins/event-backbone.ts";

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

export const useBackboneBrain = UB;

export const createNeuron = CN;

// the plugin installer object
const eventsBackboneSpineInstaller: installEventsBackbone = {
    install: (app: App): void => {
        if (!app) {
            console.warn("No app parameter provided, returning...")
            return;
        }
        app.config.globalProperties.$EventsBackBone = BB;
        app.config.globalProperties.$EventsBackboneBrain = UB();
    }
}
export default eventsBackboneSpineInstaller

// for a more subtle control, give access to instance of backbone
export function useBackbone(): EventsBackboneSpine {
    return BB;
}
