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

    checkKeys(obj: any): number;

    emitEvent(currentInstance: ComponentInternalInstance,
              ev: string,
              data?: any,
              global?: boolean): void;

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
    eventData?: any
    global?: boolean
}

export interface EventsBackboneSpineEntryOption {
    stopPropagation?: boolean | ((backboneEvent: EventsBackboneSpineEvent) => boolean)
    once?: boolean | ((backboneEvent: EventsBackboneSpineEvent) => boolean)
}

export type EventsBackboneSpineEntryOptions = { [handlerName:string]: EventsBackboneSpineEntryOption };

export interface EventsBackboneSpineEntry {
    uid: number
    registeredHandlers: { [eventName:string]: Set<EventsBackboneEventHandler> }
}

export type EventsBackboneDirectiveParam = { handler: EventsBackboneEventHandler, options?: EventsBackboneSpineEntryOption };

export type EventsBackboneDirectiveParams = { [key:string]: Array<EventsBackboneDirectiveParam> };

export type EventsBackboneEmitter = (<T>(data?: T, global?: boolean) => Promise<void>);

export type EventsBackboneEmitterGenerator = (evt: string) => EventsBackboneEmitter;

export const createEventsBackboneEmitter: InjectionKey<EventsBackboneEmitterGenerator> = Symbol('EventsBackboneEmitter');
