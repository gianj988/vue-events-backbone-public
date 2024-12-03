import { type App, ComponentInternalInstance } from "vue";
import {EventsBackboneSpine} from "../plugins/event-backbone.ts";

declare module "vue" {
    export interface EventsBackboneProperties {
        $eventsBackbone: {
          eventsBackboneSpine: EventsBackboneSpine,
        };
    }
}

import plugin from "../index";
import {EventsBackboneAxon} from "../plugins/backbone-axon.ts";
export default plugin;

export * from "../index";

export interface EventsBackboneDendriteFunctions {
    [key: EventsBackboneNeurotransmitterKey]: NeuronCallbckFn
}

export interface EventsBackboneAxonInterface {
    transmitSignal(s: EventsBackboneNeurotransmitterKey, d?: any): any;
    getNeuronFrom(): EventsBackboneNeuronInterface | undefined;
    getAxonKey(): EventsBackboneAxonKey;
    destroy(notifySenderNeuron: boolean, doNotAutoRecreate?: boolean): void;
}

export interface EventsBackboneDendriteInterface {
    getComponentInstance(): ComponentInternalInstance;
    setNeurotransmitterCallbacks(cbsf: EventsBackboneDendriteFunctions): void;
    removeNeurotransmitterCallbacks(cbsfk: EventsBackboneNeurotransmitterKey[]): void;
    getNeuron(): EventsBackboneNeuronInterface;
    deleteAxonFromDendrite(k: string, doNotAutoRecreate?: boolean): void;
    deliverSignalToDendrite(n: EventsBackboneNeurotransmitterKey, d?: any): any;
    sendSignalFromDendrite(ak: EventsBackboneAxonKey, s: EventsBackboneNeurotransmitterKey, data?: any): Promise<any>;
    destroy(): void;
}

export interface EventsBackboneBrainInterface {
    generateNeuron(s: EventsBackboneNeuronKey, c: ComponentInternalInstance, cbs?: EventsBackboneDendriteFunctions): EventsBackboneDendriteInterface;
    requestNeuronForAxon(neuronFromKey: EventsBackboneNeuronKey, neuronToKey: EventsBackboneNeuronKey): Promise<EventsBackboneNeuronInterface | void>;
    deleteNeuron(ngKey: EventsBackboneNeuronKey): void;
    stopPendingAxonRequest(nf: EventsBackboneNeuronKey, nt: EventsBackboneNeuronKey): void;
}

export interface EventsBackboneNeuronInterface {
    addDendrite(n: EventsBackboneDendriteInterface): EventsBackboneDendriteInterface;
    getDendrites(): Set<EventsBackboneDendriteInterface>;
    deleteDendrite(n: EventsBackboneDendriteInterface): void;
    hasDendrite(n: EventsBackboneDendriteInterface): boolean;
    getNeuronKey(): EventsBackboneNeuronKey;
    requestAxon(ak: EventsBackboneAxonKey, neuronToKey: EventsBackboneNeuronKey): Promise<EventsBackboneAxonInterface | undefined>;
    sendSignal(ak: EventsBackboneAxonKey, n: EventsBackboneNeurotransmitterKey, d?: any): Promise<any>;
    deliverSignal(n: EventsBackboneNeurotransmitterKey, d?: any): Promise<any>;
    destroy(): void;
    getAxons(): Map<EventsBackboneAxonKey, EventsBackboneAxon>;
    getAxon(k: string): EventsBackboneAxon | undefined;
    deleteAxon(k: string, doNotAutoRecreate?: boolean): void;
    notifyCutAxonFromReceiverNeuron(ak: EventsBackboneAxonKey, neuronToKey: EventsBackboneNeuronKey, doNotAutoRecreate: boolean): Promise<void>;
    notifyCutAxonFromSenderNeuron(ak: EventsBackboneAxonKey): Promise<void>;
    addAxonRequest(nt: EventsBackboneNeuronKey): void;
    removeAxonRequest(nt: EventsBackboneNeuronKey): void;
    stopPendingAxonRequest(nt: EventsBackboneNeuronKey): void;
    receiveAxon(a: EventsBackboneAxonInterface): void;
}

export interface EventsBackboneSpineInterface {
    emitEvent(currentInstance: ComponentInternalInstance,
              ev: string,
              data?: any,
              config?: { global?: boolean, eager?: boolean }): void;

    on(componentInstance: ComponentInternalInstance,
       ev: string,
       h: EventsBackboneEventHandler): void;

    off(uid: number,
        ev: string,
        h?: EventsBackboneEventHandler): void;

    offAll(c: ComponentInternalInstance): void;
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
    emitEvent: EventsBackboneEmitFn
}

// export interface EventsBackboneDirectiveParam { handler: EventsBackboneEventHandler }

export interface EventsBackboneDirectiveParams { [key:string]: Array<EventsBackboneEventHandler> }

export type EventsBackboneAddListenerFn = (ls: EventsBackboneDirectiveParams, replace?: true) => void;

export type EventsBackboneRemoveListenerFn = (ls: EventsBackboneDirectiveParams) => void;

export type EventsBackboneEmitFn = ((ev: string, data?: any, global?: boolean, eager?: false) => Promise<void>);

// Backbone Axon types

export type NeuronCallbckFn = (data?: any) => any;

export type EventsBackboneNeuronKey = string

export type EventsBackboneAxonKey = string

export type EventsBackboneNeurotransmitterKey = string

export type EventsBackboneAxonSignal = string
