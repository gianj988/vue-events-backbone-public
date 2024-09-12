import type {App} from "vue";
import {createEventsBackboneEmitter, EventsBackboneEmitter, installEventsBackbone} from "./types";
import {getCurrentInstance} from "vue";
import {EventsBackBoneDirective, BB, EventsBackboneSpine} from "./plugins/event-backbone.ts";

function installBackbone(app: App): void {
    if (!app) {
        console.warn("No app parameter provided, returning...")
        return;
    }
    app.config.globalProperties.$EventsBackBone = BB;
    app.provide(createEventsBackboneEmitter, (evt: string): EventsBackboneEmitter => {
        const currentComponentInstance = getCurrentInstance();
        if (!currentComponentInstance) {
            console.warn("No current component instance. createBackboneEmitter has to be called inside a lifecycle hook.");
            return (data?: any, global?: boolean) => {
                console.warn("Default backbone emitter called. No event transmitted through the backbone.");
                return Promise.resolve();
            };
        }
        return function (data?: any, global?: boolean) {
            return BB.emitEvent(currentComponentInstance, evt, data, global);
        }
    });
}

// for a more subtle control, give access to instance of backbone
function useBackbone(): EventsBackboneSpine {
    return BB;
}

// the plugin installer object
const eventsBackboneSpineInstaller: installEventsBackbone = {
    install: installBackbone
}

export {
    EventsBackBoneDirective as EventsBackBoneDirective,
    eventsBackboneSpineInstaller as default,
    useBackbone as useBackbone,
    createEventsBackboneEmitter as createEventsBackboneEmitter
}
