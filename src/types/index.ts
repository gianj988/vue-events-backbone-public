import {type App, ComponentInternalInstance, InjectionKey} from "vue";
import {EventsBackboneSpine} from "../plugins/event-backbone.ts";

declare module "vue" {
    export interface EventsBackboneProperties {
        $eventsBackbone: {
          eventsBackboneSpine: EventsBackboneSpine,
        };
    }
}

import plugin from "../index";
export default plugin;

export * from "../index";

export interface EventsBackboneSpineInterface {
    emitEvent(currentInstance: ComponentInternalInstance,
              ev: string,
              data?: any,
              config?: { global?: boolean, eager?: boolean }): void;

    on(componentInstance: ComponentInternalInstance,
       ev: string,
       h: EventsBackboneEventHandler,
       opts?: EventsBackboneSpineEntryOption): void;

    off(uid: number,
        ev: string,
        h?: EventsBackboneEventHandler): void;

    offAll(uid: number): void;
}

export interface installEventsBackbone {
    install: (app: App) => void;
}

export type EventsBackboneEventHandler = ((be: EventsBackboneSpineEvent) => void);

export interface EventsBackboneSpineEvent {
    emitterComponentInstance: ComponentInternalInstance
    handlerCallerComponentInstance: ComponentInternalInstance
    eventName: string
    branchSymbols: Array<Symbol>
    eventData?: any
    global?: boolean
    propagationStopped?: boolean | null
    eager?: boolean | null
    stopPropagation: (() => void)
    once: (() => void)
    transformEvent: ((newName: string, newData?: any) => void)
}

export interface EventsBackboneSpineEntryOption {
    stopPropagation?: boolean | ((backboneEvent: EventsBackboneSpineEvent) => boolean)
    once?: boolean | ((backboneEvent: EventsBackboneSpineEvent) => boolean)
}

export type EventsBackboneDirectiveParam = { handler: EventsBackboneEventHandler, options?: EventsBackboneSpineEntryOption };

export type EventsBackboneDirectiveParams = { [key:string]: Array<EventsBackboneDirectiveParam> };

export type EventsBackboneEmitter = (<T>(data?: T, global?: boolean, eager?: boolean) => Promise<void>);

export type EventsBackboneEmitters = { [evname:string]: EventsBackboneEmitter};

export type EventsBackboneEmitterGenerator = <PT extends string | Array<string>>(evt: PT) => PT extends string ? EventsBackboneEmitter : EventsBackboneEmitters;

export const createEventsBackboneEmitter: InjectionKey<EventsBackboneEmitterGenerator> = Symbol('EventsBackboneEmitter');
