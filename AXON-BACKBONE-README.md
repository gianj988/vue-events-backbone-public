# BackboneAxon

This is a more specific version to link different components managing at the same time their respective lifecycles
automatically.

This submodule exports a "createNeuron" function that basically creates an "anchor" for a component instance.

A **BackboneNeuron** can be seen as a box that contains N component instances of the same Component Type.
Each component instance is called a dendrite.
E.g.

you have a CompA.vue file in which you call **createNeuron**. Let's say that this CompA represents a Sale Order Line,
so could be from 0 to N instances of this CompA.
**createNeuron** function adds each CompA instance to the same BackboneNeuron, and it returns the CompA instance 
dendrite object.

from a dendrite you can request a link to another neuron, this link is called the "axon".
The target neuron does not to necessarily be instanciated, the request it's a lazy request that dinamically creates the
axon when the target neuron is instanciated.
The "brain", behind the scene, takes care of all the cycles of the neurons and axons. This means that axons are being
connected, cut and re-connected as target neurons are instanciated or destroyed.

Let's get to the code:

first of all, installing the events-backbone, you are installing also the backbone-brain that holds all neurons,
dendrites and axons that will be created after.

To register a dendrite inside a component you have to...:
```
// import the necessary from the vue-events-backbone package
import {
  createNeuron,
  EventsBackboneDendriteInterface,
  EventsBackboneDirectiveParams
} from "vue-events-backbone";

// define the variable where to store the dendrite instance
let currentInstanceDendrite: EventsBackboneDendriteInterface;
```

...then inside one of the lifecycle hooks:

```
onMounted(() => {
  currentInstanceDendrite = createNeuron("the-key-for-the-neuron", {
    'key-to-the-handler-function': (a: any) => {
        // fn body
    }
  })
})
```

Ok, what's happening here? 
1) createNeuron function registers the neuron with the given key (or updates the neuron with the same key if it 
already exists) inside the backbone-brain. It also creates the dendrite for the current component instance.

2) the second parameter of the createNeuron function registers a handler with the key: key-to-the-handler-function
inside the dendrite.

You could think of a backbone-neuron as an anchor with a known key. This anchor can send/receive signals (defined 
with a specific key and optional datas) to/from other neurons, if the key of the received signal matches 
the handler key, this handler will be called for all the dendrites that have been registered in this neuron
(hint, 'key-to-the-handler-function' could be constructed programmatically to send specific signals to specific dendrites
avoiding calling handlers for all the dendrites inside a neuron. Of course the sending neuron must know the specific key
to which send the signal)

The mean through which the signal is sent is the backbone-axon.
A backbone-axon is requested by a neuron and targets another neuron. It is a 1 to 1 link with a direction, the target 
neuron is the receiver and the "requester" is the sender.
This design allows to call handlers on all the dendrites registered on the receiver neuron.
Each handler is registered with a key (a simple string).
This key can be static (a string that is the same for each dendrite) or dynamic (it's specific for each dendrite).
If it's static, it should represent a handler function taht will be called for all dendrites of the receiver neuron.
If it's dynamic, it should represent a handler function that's specific to only some or even a single dendrite. 
Obviously this means that the sender neuron must know how to recreate the specific handler key, or 
you can export the keys from a file to share them among sender and receiver neurons.
The steps to request a backbone-axon are:
1) get the neuron from the dendrite:
```
const currentDendriteNeuron = currentInstanceDendrite.getNeuron();
```

2) request the axon creation through it, choosing a key and retrieving the target neuron key
```
currentDendriteNeuron.requestAxon("the-axon-key", "the-target-neuron-key");
```

this 'requestAxon' function returns a promise that will fulfill in each of these cases:

- the target neuron already exists
- the target neuron was not mounted and has just been mounted

if none of these cases are met, it will wait indefinetly (behind the scene it's just a waiting promise)

To send signals through the axon, you can do it in two ways:
```
// 1 through the dendrite
currentInstanceDendrite.sendSignalFromDendrite("the-axon-key", "the-key-to-the-handler-fn", optional-data);

// 2 through the neuron
currentInstanceDendrite.getNeuron().sendSignal("the-axon-key", "the-key-to-the-handler-fn", optional-data);
```

if the axon doesn't exist, or it is still in the requested state (the promise didn't fulfill yet) you'll see a warning 
in console. 

### WHAT HAPPENS WHEN A TARGET NEURON IS BEING DESTROYED

If a target neuron is being destroyed, the related axons pointing to it return to the "requested" state,
waiting for the neuron to be created again.
The logic behind this is: because two neurons could represent two components that are not necessarily kindred, 
if you previously requested an axon linking them, you'll probably want this link to exist every time these components
are both mounted.

You can always destroy an axon in two ways (the result will be exactly the same):

```
way 1 // directly from the single dendrite
currentInstanceDendrite.deleteAxonFromDendrite("the-axon-key", doNotAutoRecreate)

way 2 // from the neuron
    // get the neuron
    const neuron = currentInstanceDendrite.getNeuron()
    // get the axon
    const axon = neuron.deleteAxon("the-axon-key", doNotAutoRecreate)

// deleteAxon will give a warning if there is no registered (or pending) axon with that given key
```

doNotAutoRecreate parameter is needed to prevent the autorecreation of the axon when the target neuron
will unmount -> mount.
I advise setting this parameter to true if you manually destroy an axon.
You'll have to remember to manually request the axon again later if you want to use it.
