# EventsBackbone

In Vue, custom events do not propagate through the components tree. A simple solution to this problem
is Dependency Injection with Provide/Inject to make component functions and properties available to
its children.

This plugin is a complete Event Bus that simulates DOM events propagation but through components tree.
It features:

- asynchronous execution of handlers to avoid clogging main thread
- no Vue 3 events handling modification
- plugin installer app.use compatible
- directive installable with app.directive to register event handlers from a component
- event hierarchy definable directly with event naming
- vue3-similar emitters instantiation
- emitter functions return a promise to notify when it 
has consumed all handlers (in eager mode or lazy) 
- stopPropagation capability
- once capability
- transformEvent capability inside handlers to avoid stopPropagation and re-emitting the new event.
- emitEvent capability inside handlers to emit another event on the fly
- custom event data to pass (even functions, objects etc...)
- possibility to emit an event globally instead of DOM-like events propagation
- error handling to avoid interrupting the propagation
- focus on the ease-of-use

The package exports:

- **the plugin installer to install with app.use() (default)**
- **the plugin directive to register on the app with app.directive()**, that will be used to register event listeners on those components that need to
- **defineBackboneEmits** function to define emitters more easily
- **defineAddEventListeners** and **defineRemoveEventListeners** functions to handle listeners registration/unregistration manually
- **useBackbone** function that will return the internal EventsBackbone instance. 
This is for a more precise control of the mechanism and for those who like adventure.
- **createNeuron**
- **useBackboneBrain**

## TABLE OF CONTENT:

[Plugin installation in vue app](#1-install-the-plugin-on-your-vue-app)

[Event listener Registration](#2-registerunregister-event-listeners)

  - [Event listener managing with directive](#21-register-event-listeners-using-the-directive)
  - [Event listener managing with generated addEventListeners and removeEventListeners functions](#22-manage-event-listeners-using-generated-addeventlisteners-and-removeeventlisteners-functions)

[Emitters Functions Creation and Emit events](#3-emitter-functions-creation-and-emit-custom-events-with-data-from-a-child-component)

  - [Emitters Functions generation with new 'defineBackboneEmits'](#311-emitters-creation-with-the-new-definebackboneemits-function)

[Listen All event key and New Event Naming Semantic](#4-new-events-naming-semantic-and-listen-all-events-keyword)

  - [Listen All Key](#41-listen-all)
  - [New Event Name Semantic](#42-new-events-name-semantic)
  - [Event Naming Rules](#43-event-naming-rules)

[EventsBackboneSpineEvent OBJECT DESCRIPTION](#5-notes-on-eventsbackbonespineevent-object)

### 1. INSTALL THE PLUGIN ON YOUR VUE APP

To install the plugin and the directive you have to:

```
import installEventsBackbone, { EventsBackBoneDirective } from 'vue-events-backbone';

app.use(installEventsBackbone);
app.directive("nameOfYourChoice", EventsBackBoneDirective);
```
For more info on how to install a directive in your vue app please refer to **[the Vue3 doc on custom directive](https://vuejs.org/guide/reusability/custom-directives)**
It is advised to install this directive globally in order to allow its use on all components in your project.

Take note of nameOfYourChoice because it will become the actual directive name to use with "v-".

---

### 2. REGISTER/UNREGISTER EVENT LISTENERS

#### 2.1 REGISTER EVENT LISTENERS USING THE DIRECTIVE

This is the simplest case: if a component has to ALWAYS register listeners onBeforeMount and unregister listeners onBeforeUnmount, the directive does exactly that, automatically.

The directive takes an object of type EventsBackboneDirectiveParams, which has this definition
```
// these types are exported by this package
type EventsBackboneEventHandler = ((be: EventsBackboneSpineEvent) => void);
interface EventsBackboneDirectiveParams = { [key:string]: Array<EventsBackboneEventHandler> };
```
##### Directive Usage:
```
<script setup>
...whatev...
const theHandlerFn = function(b: EventsBackboneSpineEvent) { // fn body }
...whatev...
</script>
<template>
  <YourComponentRootTag v-nameOfYourChoice="{'eventName1': [theHandlerFn, ...], 'eventName2': ...}">
    ...
  </YourComponentRootTag>
</template>
```
**theHandlerFn** must take a parameter of EventsBackboneSpineEvent type (importable from this package, see doc below for its description).
The directive handles the on/off of registered event listeners, according to the component lifecycle.
It is advised to place the directive on the root tag of the component, although it should work anyway

NOTE: if the component has also to ALWAYS replace and re-register all listeners onUpdate, you can add **:update** arg
to the directive. Eg. v-nameOfYourChoice:update="{ etc. }.

---

#### 2.2 MANAGE EVENT LISTENERS USING GENERATED addEventListeners AND removeEventListeners FUNCTIONS

For all those cases where you have to handle listeners subscriptions and unsubscriptions in a more complex way,
this package exports **defineAddEventListeners** and **defineRemoveEventListeners** functions.
These functions can be used in two ways:

1) in explicit setup() function, where you can call getCurrentInstance() method to get the component 
internal instance reference, that you'll have to pass as parameter.
2) in lifecycle hooks when used within ```<script setup>```, here you can avoid calling getCurrentInstance(), internally these functions can
retrieve the instance automatically

In both cases, they'll return a function that can be used to register (returned from defineAddEventListeners) and
unregister (returned from defineRemoveEventListeners) listeners for that component.

##### Generator Functions and Generated Functions Usage:

1) Call the functions and store in two variables their returned function:
```
// <script setup> in lifecycle hook
onMounted(() => {
  // assuming that you have previously defined these variables inside your <script setup> section
  customAddEventListenerVar: EventsBackboneAddListenerFn = defineAddEventListeners();
  customRemoveEventListenerVar: EventsBackboneRemoveListenerFn = defineRemoveEventListeners();
  // now customAddEventListenerVar has the "addEventListener" function
  // customRemoveEventListenerVar has the "removeEventListener" function
})
```

```
// in explicit setup() function
export default {
  setup() {
    // get component instance
    const instance = getCurrentInstance();
    // pass the instance as parameter and get the generated functions
    const customAddEventListenerVar: EventsBackboneAddListenerFn = defineAddEventListeners(instance);
    const customRemoveEventListenerVar: EventsBackboneRemoveListenerFn = defineRemoveEventListeners(instance);
    // use them where you want
    // better export them
    return {
      customAddEventListenerVar,
      customRemoveEventListenerVar
    }
  }
};
```
2) From now on you can call these generated functions whenever you need. Both take a single parameter
of type **EventsBackboneDirectiveParams**. In addition to this, customAddEventListenerVar takes one more optional parameter
of type: boolean (default false), if you need to replace all registered listeners of the specific component where customAddEventListenerVar is called.
```
// your handler
const customEventHandler = function(b: EventsBackboneSpineEvent) { // fn body };

// your listeners definition
const exampleListeners = { 'yourCustomEvent': [customEventHandler] };

// register listeners
customAddEventListenerVar(exampleListeners, replace?: true | false);

// unregister listeners
customRemoveEventListenerVar(exampleListeners);
```
This pattern is required to save you the fuss of getting the internal component instance and create the function yourself.
That's why you have to call them inside one of lifecycle hooks.

When a component that registered listeners is unmounted (through the directive or the customAddEventListenerVar), it automatically unregisters them.

---

### 3. EMITTER FUNCTIONS CREATION AND EMIT CUSTOM EVENTS WITH DATA FROM A CHILD COMPONENT

#### 3.1.1 EMITTERS CREATION WITH THE NEW defineBackboneEmits FUNCTION

To simplify further the process of generating emitters (and to stick more to "the Vue3 way"), a **defineBackboneEmits**
function has been introduced.
The usage is similar to Vue native macro defineEmits, with the difference that **defineBackboneEmits is not a macro**. 
Infact internally it still requires access to the current component instance and, because of that, it must be called inside one of component
lifecycle hooks to create emitters correctly.

**defineBackboneEmits** accepts an optional parameter of type "Array<string>".
If called without parameters, it will return a general emitter function that can emit any event name you want.
If called with an array of strings, it will return an emitter function that can emit only those specified events.

#### 3.1.2 How to Define Emitter Function

1) import the function along with its returned type, into the script section in an SFC file (import in App.vue if you want to provide it globally)
and define a variable (or a ref, if you prefer) in which you will store the emitter function: 
```
import {
  defineBackboneEmits, type EventsBackboneEmitFn
} from 'vue-events-backbone'

// define the variable where you'll store the emitter
let backboneEmitter: EventsBackboneEmitFn;
```
2) inside one of component lifecycle hooks:
```
onMounted(() => {
  // assign to the previously defined variable the generated emitter function
  backboneEmitter = defineBackboneEmits(["foo", "bar", "baz:whatev"]);
})
```
#### 3.1.3 Usage of Emitter function created with **defineBackboneEmits**

The usage of backboneEmitter (from the previous example) it's very similar to the Vue3 emit generated with defineEmits macro.
As we passed `["foo", "bar", "baz:whatev"]` array in the previous example, backboneEmitter can emit only those events.
```
// if ifGlobal = true -> the event will be notified to all components that registered a listener
// ignoring if they are ancestors of emitter component or not
// if ifNotEager = false -> the promise returned will be fulfilled only when all handlers have
// finished their execution (in case of asynchronous handlers, otherwise it will have no effect)
backboneEmitter("foo", optionalDataToSend, ifGlobal, ifNotEager) // emits a foo event
backboneEmitter("baz:whatev", optionalDataToSend, ifGlobal, ifNotEager) // emits a baz:whatev event
backboneEmitter("bar:whatev", optionalDataToSend, ifGlobal, ifNotEager) // warning: event not valid (not emitted)
```
If we called defineBackboneEmits with no arguments (for example ```backboneEmitter = defineBackboneEmits();```)
we could emit anything we want with no limitations (this replicates the Vue3 inline $emit behaviour):
```
backboneEmitter("whatever", optionalDataToSend, ifGlobal, ifNotEager) // emits a whatever event
```

---

### 4. NEW EVENTS NAMING SEMANTIC AND LISTEN ALL EVENTS KEYWORD

#### 4.1 LISTEN ALL

In order to listen for all custom events emitted through the Event Backbone Emitter Functions, the eventName used in the directive
must be "*".
EG: 
```
<template>
  <YourComponentRootTag v-nameOfYourChoice="{'*': [theHandlerFn, ...], 'eventName2': ...}">
    ...
```
In this way YourComponent will listen for all events emitted from one of its children (or for all events emitted globally).

#### 4.2 NEW EVENTS NAME SEMANTIC

I decided to give to developers the possibility to define an "Event Hierarchy" directly with the event name.

More specifically, if I register an **x:y:z** event with the directive (see point 2) I'm defining a "tree-branch" with "x" being the root, "y" being a node and "z" being the leaf.

In this way a component that listens for "x:y" event, will be triggered by all events emitted that have "x:y" as their parents.

For example: "x:y" itself, "x:y:z", "x:y:foo:bar", etc. 

However, it won't be triggered by events like "y:x", "y", "z:x:y" and so on. The emitted event has to 
specify the exact branch from the root node.

This implies also that a component listening for event "x" is like a "listen all" specific for events belonging to "x" root.
In this way, developers can build a more complex event-based components design more clearly and easily.

It is noteworthy also that if a component listens for "x:y" event and "x" event at the same time, both will be triggered by
an event with "x:y" parents, from bottom to top. So "x:y" handlers will be executed before "x" handlers.

#### 4.3 EVENT NAMING RULES:

Considered the new event name meaning, there are some rules to follow when choosing the event name to listen for: 
- the listen all "\*" must be alone. So "*:whatever" is forbidden.
- the name cannot have trailing ":". ":whatever", "whatever:" are forbidden
- spaces in event names are forbidden.
- consequent colons or colons separated by spaces are forbidden. So no "what::ever" or "what:  :ever".

In each of these cases, the directive will throw an error and it will not register that specific event listener.
All valid names will still be registered

---

### 5. NOTES ON EventsBackboneSpineEvent OBJECT

The event emitted will be described by a "**EventsBackboneSpineEvent**" object that will be passed as parameter of each
event handler to call. This object will contain:

1) **emitterComponentInstance**: the instance of the component that emitted the event 
2) **handlerCallerComponentInstance**: the instance of the component currently handling the event
3) **eventName**: the event name
4) **eventData**: the data passed through (optional)
5) **branchSymbols**: an array of symbols referring to the events hierarchy (MESS WITH IT AT YOUR OWN RISK)
6) **global**: if event has been emitted globally as opposed to the default backbone behaviour that 
follows the components tree branch from the emitter child to the root (optional, default false).
7) **propagationStopped**: if propagation has been stopped (useful if other handlers have been registered for the same event and component)
8) **eager**: if the handlers caller function is awaiting handlers execution (in case of async handlers)
9) **stopPropagation**: function to call inside the handler to stop propagation of the custom event **(if event has not been emitted globally)**
10) **once**: function to call inside the handler to unregister it once executed.
11) **transformEvent**: function to transform current handled event into another event. **(if event has not been emitted globally)**
12) **emitEvent**: function to emit another event from inside an event handler directly. The Emitter Component Instance will be
the component that is managing the handler in which emitEvent has been called

The transformEvent function takes two parameters:
1) the new event name (required, hierarchy is valid and naming rules will be applied)
2) the new data to pass with the new event (optional, if nothing is passed old data will be kept)

The emitEvent function takes the same parameters of an EventBackboneEmitFn and returns the new related Promise.

It is noteworthy that the **once** function works with the original event, not the transformed event.
So for example, if I emitted **"x:y"** event, inside one of the handlers **transformEvent** has been called
with **new event name = "foo:bar"** and inside the same handler, after transformEvent, **once** has been called: the once function
will take effect for the original **"x:y"** event.

---

### GENERAL NOTES:

- **stopPropagation** option will NOT work if the event is emitted with global: true, as in this case it's notpossible to consistently decide
the order of handlers to call;
- **once** option will unregister ONLY the specific handler for which the option is set, even if a component have registered
more different handlers for the same event.
