import {ComponentInternalInstance, getCurrentInstance} from "vue";
import {dopeComponentInstance, dopedComponentInternalInstance} from "./event-backbone.ts";
import {
    EventsBackboneAxonInterface,
    EventsBackboneAxonKey,
    EventsBackboneBrainInterface,
    EventsBackboneDendriteFunctions,
    EventsBackboneDendriteInterface,
    EventsBackboneNeuronInterface,
    EventsBackboneNeuronKey,
    EventsBackboneNeurotransmitterKey,
    NeuronCallbckFn
} from "../types";

declare interface EventsBackboneBrainConstructor {
    new(): EventsBackboneBrain;
}

export class EventsBackboneAxon implements EventsBackboneAxonInterface {
    private neuronFrom?: EventsBackboneNeuron;
    private neuronTo?: EventsBackboneNeuron;
    private readonly axonKey: EventsBackboneAxonKey;
    constructor(ak: EventsBackboneAxonKey, neuronFrom: EventsBackboneNeuron, neuronTo: EventsBackboneNeuron) {
        this.neuronFrom = neuronFrom;
        this.axonKey = ak;
        this.neuronTo = neuronTo;
    }
    async transmitSignal(s: EventsBackboneNeurotransmitterKey, d?: any): Promise<any> {
        if(!this.neuronTo) {
            console.log("No neuron linked to axon with key: " + this.axonKey);
            return [];
        }
        return await this.neuronTo.deliverSignal(s, d);
    }
    getNeuronFrom() {
        return this.neuronFrom;
    }
    getAxonKey() {
        return this.axonKey;
    }
    destroy(notifySenderNeuron: boolean, doNotAutoRecreate?: boolean): void {
        if(this.neuronFrom && this.neuronTo) {
            if(notifySenderNeuron) {
                if(this.neuronFrom) {
                    this.neuronFrom.notifyCutAxonFromReceiverNeuron(this.axonKey, this.neuronTo.getNeuronKey(), !!doNotAutoRecreate);
                }
            }
            if(this.neuronTo) {
                this.neuronTo.notifyCutAxonFromSenderNeuron(this.axonKey);
            }
        }
        this.neuronTo = undefined;
        this.neuronFrom = undefined;
    }
}

export class EventsBackboneDendrite implements EventsBackboneDendriteInterface {
    private dendriteComponent?: dopedComponentInternalInstance;
    private neuron?: EventsBackboneNeuron;
    private callbacks: Map<EventsBackboneNeurotransmitterKey, NeuronCallbckFn>;
    constructor(c: dopedComponentInternalInstance, ng: EventsBackboneNeuron, cbs?: EventsBackboneDendriteFunctions) {
        this.callbacks = new Map();
        this.neuron = ng;
        this.dendriteComponent = c;
        if(cbs) {
            this.setNeurotransmitterCallbacks(cbs);
        }
        c.isUnmountedCallbacks.push(this.destroy.bind(this));
    }
    getComponentInstance() {
        return this.dendriteComponent as ComponentInternalInstance;
    }
    setNeurotransmitterCallbacks(cbsf: EventsBackboneDendriteFunctions) {
        for(const cbsfk in cbsf) {
            this.callbacks.set(cbsfk, cbsf[cbsfk]);
        }
    }
    removeNeurotransmitterCallbacks(cbsfk: EventsBackboneNeurotransmitterKey[]) {
        for(const cbk of cbsfk) {
            this.callbacks.delete(cbk);
        }
    }
    getNeuron(): EventsBackboneNeuron {
        return this.neuron as EventsBackboneNeuron;
    }
    deliverSignalToDendrite(n: EventsBackboneNeurotransmitterKey, d?: any): any {
        const cb = this.callbacks.get(n);
        if(cb) {
            try {
                return cb(d);
            } catch(e: any) {
                console.error(e);
            }
        }
    }
    sendSignalFromDendrite(ak: EventsBackboneAxonKey, s: EventsBackboneNeurotransmitterKey, data?: any): Promise<any> {
        return this.getNeuron().sendSignal(ak, s, data);
    }
    deleteAxonFromDendrite(k: string, doNotAutoRecreate?: boolean): void {
        console.log("deleteAxonFromDendrite");
        console.log(k);
        console.log(doNotAutoRecreate);
        this.neuron?.deleteAxon(k, doNotAutoRecreate);
    }
    destroy(): void {
        this.dendriteComponent = undefined;
        this.callbacks.clear();
        this.neuron?.deleteDendrite(this);
        this.neuron = undefined;
    }
}

// rappresenta un gruppo di components tutti dello stesso tipo attualmente montati
// dato che la richiesta di creazione del neurone avviene nei lifecycle hooks che vengono
// eseguiti da tutte le istanze montate di un componente
export class EventsBackboneNeuron implements EventsBackboneNeuronInterface {
    private readonly dendrites: Set<EventsBackboneDendrite>;
    private brain?: EventsBackboneBrain;
    private readonly neuronKey: EventsBackboneNeuronKey;
    private readonly senderAxons: Map<EventsBackboneAxonKey, EventsBackboneAxon>;
    private readonly receiverAxons: Map<EventsBackboneAxonKey, EventsBackboneAxon>;
    private readonly pendingAxonRequests: Set<EventsBackboneNeuronKey>;
    // private readonly signalsQueue: Map<EventsBackboneAxonKey, [EventsBackboneNeurotransmitterKey, any]>
    constructor(b: EventsBackboneBrain, nk: EventsBackboneNeuronKey, ...ns: EventsBackboneDendrite[]) {
        this.brain = b;
        this.neuronKey = nk;
        this.dendrites = new Set(ns);
        this.senderAxons = new Map(); // questi sono gli Axons di default perchè sono quelli richiesti da "questo" neurone
        this.receiverAxons = new Map();
        this.pendingAxonRequests = new Set();
        // this.signalsQueue = new Map();
    }
    addDendrite(n: EventsBackboneDendrite) {
        this.dendrites.add(n);
        return n;
    }
    getDendrites() {
        return this.dendrites;
    }
    deleteDendrite(n: EventsBackboneDendrite) {
        this.dendrites.delete(n);
        if(this.size === 0) {
            this.destroy();
        }
    }
    hasDendrite(n: EventsBackboneDendrite) {
        return this.dendrites.has(n);
    }
    getNeuronKey() {
        return this.neuronKey;
    }
    getAxons(): Map<EventsBackboneAxonKey, EventsBackboneAxon> {
        return this.senderAxons;
    }
    getAxon(k: EventsBackboneAxonKey): EventsBackboneAxon | undefined {
        return this.senderAxons.get(k);
    }
    deleteAxon(k: EventsBackboneAxonKey, doNotAutoRecreate?: boolean): void {
        console.warn("deleteAxon");
        console.log(k);
        console.log(doNotAutoRecreate);
        const a = this.getAxon(k);
        console.log("a", a);
        if(a) {
            a.destroy(false, doNotAutoRecreate);
            this.senderAxons.delete(k)
            return;
        } else if(this.pendingAxonRequests.has(k)) {
            this.stopPendingAxonRequest(k);
            return;
        }
        console.warn(`No axon with key ${k} has been found on neuron ${this.neuronKey}`);
    }
    // quando il neurone ricevente viene distrutto, notifica il neurone trasmettitore
    // che occorre ricreare l'assone (attendendo per quando verrà rimontato eventualmente
    // il neurone ricevente)
    async notifyCutAxonFromReceiverNeuron(ak: EventsBackboneAxonKey, neuronToKey: EventsBackboneNeuronKey, doNotAutoRecreate: boolean) {
        const wasPresent = this.senderAxons.delete(ak);
        if(doNotAutoRecreate || !wasPresent) {
            return;
        }
        await this.requestAxon(ak, neuronToKey);
    }
    async notifyCutAxonFromSenderNeuron(ak: EventsBackboneAxonKey) {
        this.receiverAxons.delete(ak);
    }
    addAxonRequest(nt: EventsBackboneNeuronKey) {
        this.pendingAxonRequests.add(nt);
    }
    removeAxonRequest(nt: EventsBackboneNeuronKey) {
        this.pendingAxonRequests.delete(nt);
    }
    stopPendingAxonRequest(nt: EventsBackboneNeuronKey) {
        if(this.brain) {
            this.brain.stopPendingAxonRequest(this.neuronKey, nt);
            this.removeAxonRequest(nt);
        }
    }
    async requestAxon(ak: EventsBackboneAxonKey, neuronToKey: EventsBackboneNeuronKey) {
        if(!this.brain) {
            throw new Error("Unable to request axon creation. Brain is not set.");
        }
        this.addAxonRequest(neuronToKey);
        try {
            const neuronTo: EventsBackboneNeuron | void = await this.brain.requestNeuronForAxon(this.neuronKey, neuronToKey);
            this.removeAxonRequest(neuronToKey);
            if(!neuronTo) {
                console.warn("Axon request from " + this.neuronKey + " to " + neuronToKey + " stopped.");
                return;
            }
            const newAxon = new EventsBackboneAxon(ak, this, neuronTo);
            neuronTo.receiveAxon(newAxon);
            this.senderAxons.set(ak, newAxon);
            return newAxon;
        } catch(e: any) {
            console.error("Error trying to request axon from neuron " + this.neuronKey + " to neuron " + neuronToKey);
            console.error(e);
            this.removeAxonRequest(neuronToKey);
        }
    }
    receiveAxon(a: EventsBackboneAxon) {
        if(a && !this.receiverAxons.has(a.getAxonKey())) {
            this.receiverAxons.set(a.getAxonKey(), a);
        }
    }
    // emette il segnale tramite l'axon verso il neuron target
    async sendSignal(ak: EventsBackboneAxonKey, n: EventsBackboneNeurotransmitterKey, d?: any): Promise<any> {
        const requestedAxon = this.senderAxons.get(ak);
        if(requestedAxon) {
            return await requestedAxon.transmitSignal(n, d);
        }
        console.log("No axon with key: " + ak + " in neuron with key: " + this.neuronKey);
        return;
    }
    // funzione per consegnare il segnale e i dati inviati dal neuron transmitter attraverso l'axon
    // ritorna tutti i risultati delle funzioni chiamate per ogni dendrite
    async deliverSignal(n: EventsBackboneNeurotransmitterKey, d?: any): Promise<any> {
        const returnedValue = [];
        for(const dendrite of this.dendrites) {
            const retval = dendrite.deliverSignalToDendrite(n, d);
            if(retval && retval instanceof Promise) {
                returnedValue.push(retval);
            } else {
                returnedValue.push(Promise.resolve(retval));
            }
        }
        return await Promise.allSettled(returnedValue);
    }
    get size() {
        return this.dendrites.size;
    }
    get length() {
        return this.size;
    }
    destroy() {
        for(const prk of this.pendingAxonRequests) {
            this.stopPendingAxonRequest(prk);
        }
        this.pendingAxonRequests.clear();
        this.brain?.deleteNeuron(this.neuronKey);
        this.brain = undefined;
        for(const sa of this.senderAxons.entries()) {
            sa[1].destroy(false);
        }
        this.senderAxons.clear();
        for(const ra of this.receiverAxons.entries()) {
            ra[1].destroy(true);
        }
        this.receiverAxons.clear();
    }
}

export class EventsBackboneBrain implements EventsBackboneBrainInterface {
    private neurons: Map<EventsBackboneNeuronKey, EventsBackboneNeuron>;
    private readonly pendingAxonRequests: Map<EventsBackboneNeuronKey, Map<EventsBackboneNeuronKey, () => any>>;
    private readonly closePendingAxonRequests: Map<EventsBackboneNeuronKey, Map<EventsBackboneNeuronKey, () => any>>;
    constructor() {
        this.neurons = new Map();
        this.pendingAxonRequests = new Map();
        this.closePendingAxonRequests = new Map();
    }
    // crea il neurone risolvendo allo stesso tempo le richieste pending di axon connection
    // provenienti da altri neurons
    generateNeuron(s: EventsBackboneNeuronKey, c: ComponentInternalInstance, cbs?: EventsBackboneDendriteFunctions): EventsBackboneDendrite {
        const dc = dopeComponentInstance(c);
        let ng = this.neurons.get(s);
        if(!ng) {
            ng = new EventsBackboneNeuron(this, s);
            this.neurons.set(s, ng);
            const requestedAxon = this.pendingAxonRequests.get(s);
            if(requestedAxon) {
                for(const cb of requestedAxon.entries()) {
                    cb[1]();
                }
            }
        }
        return ng.addDendrite(new EventsBackboneDendrite(dc, ng, cbs));
    }
    private cleanupPendingAxonRequestsCallbacks(nf: EventsBackboneNeuronKey, nt: EventsBackboneNeuronKey) {
        const pendingAxonReq = this.pendingAxonRequests.get(nt);
        const closePendingAxonReq = this.closePendingAxonRequests.get(nf);
        if(pendingAxonReq) {
            pendingAxonReq.delete(nf);
            if(pendingAxonReq.size === 0) {
                this.pendingAxonRequests.delete(nt);
            }
        }
        if(closePendingAxonReq) {
            closePendingAxonReq.delete(nt);
            if(closePendingAxonReq.size === 0) {
                this.closePendingAxonRequests.delete(nf);
            }
        }
    }
    requestNeuronForAxon(neuronFromKey: EventsBackboneNeuronKey, neuronToKey: EventsBackboneNeuronKey): Promise<EventsBackboneNeuron | void> {
        const n = this.neurons.get(neuronToKey);
        if(n) {
            return Promise.resolve(n);
        }
        return new Promise((resolve, reject) => {
            const axonsRequests = this.pendingAxonRequests.get(neuronToKey);
            const stopAxonRequests = this.closePendingAxonRequests.get(neuronFromKey);
            const resFn = () => {
                try {
                    this.cleanupPendingAxonRequestsCallbacks(neuronFromKey, neuronToKey);
                    resolve(this.neurons.get(neuronToKey) as EventsBackboneNeuron);
                } catch(e: any) {
                    this.cleanupPendingAxonRequestsCallbacks(neuronFromKey, neuronToKey);
                    console.error(e);
                    reject("unable to retrieve requested neuron");
                }
            }
            const rejFn = () => {
                this.cleanupPendingAxonRequestsCallbacks(neuronFromKey, neuronToKey);
                resolve();
            }
            if(axonsRequests) {
                axonsRequests.set(neuronFromKey, resFn)
            } else {
                const toRegisterCb = new Map([
                    [neuronFromKey, resFn]
                ]);
                this.pendingAxonRequests.set(neuronToKey, toRegisterCb);
            }
            if(stopAxonRequests) {
                stopAxonRequests.set(neuronToKey, rejFn);
            } else {
                const toRegisterCb = new Map([
                    [neuronToKey, resFn]
                ]);
                this.closePendingAxonRequests.set(neuronFromKey, toRegisterCb);
            }
        })
    }
    stopPendingAxonRequest(nf: EventsBackboneNeuronKey, nt: EventsBackboneNeuronKey) {
        const stopAxonRequests = this.closePendingAxonRequests.get(nf);
        if(stopAxonRequests) {
            const cbfn = stopAxonRequests.get(nt);
            if(cbfn) {
                try {
                    cbfn()
                } catch(e: any) {
                    console.error("Error stopping axon request from neuron " + nf + " to neuron " + nt);
                }
            }
        }
    }
    deleteNeuron(ngKey: EventsBackboneNeuronKey) {
        this.neurons.delete(ngKey);
        this.pendingAxonRequests.delete(ngKey);
    }
}

const EventsBackboneBrainFactory = function(c: EventsBackboneBrainConstructor): EventsBackboneBrain {
    return new c();
}

const BBrain = EventsBackboneBrainFactory(EventsBackboneBrain);

export function useBackboneBrain(): EventsBackboneBrain {
    return BBrain;
}

export default useBackboneBrain;

export function createNeuron(s: EventsBackboneNeuronKey, cbs: EventsBackboneDendriteFunctions) {
    const currentInst = getCurrentInstance();
    if(!currentInst) {
        throw new Error("Cannot get current component instance. Please call createNeuron inside a lifecycle hook")
    }
    return BBrain.generateNeuron(s, currentInst, cbs);
}
