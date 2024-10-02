### **1.1.1 CHANGES (backwards compatible)**: 
- now the **EventsBackboneSpineEvent** parameter passed to the handler function, will have 
**stopPropagation** and **once** functions that can be called directly inside the handler (for a more natural native events handling).
These two functions will directly set to true the respective value, overriding the relative handler option.
However, stopPropagation will still depend on the global modifier, if the event emitted is global, stopPropagation will not 
be set to true even if the handler inside calls ".stopPropagation()"
Old handler options system is still working as always.

- Better directive unexpected value type explanation.

### **1.2.0 CHANGES {backwards compatible}**:
- type EventsBackboneEmitter (the emitter functions type) now takes 3 optional parameters:
    1) data: the data to pass with the event
    2) global: if the emitted event must be considered global
    3) eager: (true by default if nothing is passed) if set EXPLICITLY to false, the internal handlers caller function
    awaits for handlers of a specific component to complete their execution (in case of async handlers) before stepping forward to handlers of the parent component.
    This also implies that the promise returned by the invoked emitter function will become fulfilled accordingly to the handlers execution.

- propagationStopped now is an information replicated on the EventsBackboneSpineEvent object 
(for when there are more handlers registered for the same event and component and it may be useful to have this information)

- small internal refactor to allow eager behaviour and preparing for future developments

#### KNOWN BUGS

- if an imported component is used inside the template section of a SFC and it has the backbone directive to register handlers, 
the registered UID in the EventsBackbone is that of the imported component instead of the actual component of the SFC file.
Temporary solution: wrap the imported component inside a standard html tag and put the directive on it.

### **1.3.0 CHANGES {backwards compatible}**:

- Internal class structure re-thinked, various optimizations
- The function that creates the emitters now takes both a string or an array<string>.
  1) if a string is passed, it returns the emitter function, same as previous versions.
  2) if an array of strings is passed, it returns an object where the emitter functions are stored with key = event name
  eg: ["foo", "bar"] => { foo: fooEmitterFn, bar: barEmitterFn };
- The EventsBackboneSpineEvent object, **if the event has not been emitted globally**, has a "transformEvent" function, 
  callable like stopPropagation and once functions inside a handler. It takes two parameters:
  1) the new event name (required)
  2) new event data (optional, if nothing is passed, old eventData will be kept)
- Added "listen all custom events" possibility (see documentation)
- Added hierarchical meaning to the event naming (see documentation)
- Fixed the bug regarding the backbone directive when used in imported component tags

### UPCOMING CHANGES

- possibility to link 2 components directly through a special separate bus
- register listeners for "x:y" event that will be triggered ONLY by this specific event (and not other "x:y:whatever" events) 
- I'll try to reduce the package size

# EventsBackbone

In Vue, custom events do not propagate through the components tree. A simple solution to this problem
is Dependency Injection with Provide/Inject to make component functions and properties available to
its children.

This plugin is a complete Event Bus that simulates DOM events propagation but through components tree.
it features:

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
- custom event data to pass (even functions, objects etc...)
- possibility to emit an event globally instead of DOM-like events propagation
- error handling to avoid interrupting the propagation
- focus on the ease-of-use

The package exports:

- **the plugin installer to install with app.use() (default)**
- **the plugin directive to register on the app with app.directive()**, that will be used to register event listeners on those components that need to
- **createEventsBackboneEmitter**, a Symbol that it's meant to be used for injecting the **EventsBackboneEmit** function. This
must be called in a component lifecycle hook as it uses getCurrentInstance() internally.
- **useBackbone** function that will return the internal EventsBackbone instance. 
This is for a more precise control of the mechanism and for those who like adventure.


## TABLE OF CONTENT:

[Plugin installation in vue app](#1-install-the-plugin-on-your-vue-app)

[Event Listeners Registration with the directive in a component template](#2-register-event-listeners-using-the-directive)

[Emitters Functions Creation](#3-emitter-functions-creation-and-emit-custom-events-with-data-from-a-child-component)

[The Emitter Generator Function](#31-the-eventsbackboneemittergenerator-function)

[New Event Naming Semantic](#4-new-events-naming-semantic-and-listen-all-events-keyword)

[New Event Naming Rules](#event-naming-rules)

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

Take note of nameOfYourChoice because it will becaome the actual directive name to use with "v-".

### 2. REGISTER EVENT LISTENERS USING THE DIRECTIVE

On the components for which you want to register the handler:
```
<script setup>
...whatev...
const theHandlerFn = function(b: EventsBackboneSpineEvent) { // fn body }
...whatev...
</script>
<template>
  <YourComponentRootTag v-nameOfYourChoice="{'eventName1': [{ handler: theHandlerFn, options?: EventsBackboneHandlerOption }, ...], 'eventName2': ...}">
    ...
  </YourComponentRootTag>
</template>
```
**theHandlerFn** must take a parameter of EventsBackboneSpineEvent type (importable from this package).
The directive handles the on/off of registered event listeners, according to the component lifecycle.
It is advised to place the directive on the root tag of the component, although it should work anyway

### 3. EMITTER FUNCTIONS CREATION AND EMIT CUSTOM EVENTS WITH DATA FROM A CHILD COMPONENT

In order to emit an event from a component to its parents (or globally):
1) import the injection key for the createEmitter function and inject the EventsBackboneEmitterGenerator function: 
```
import { createEventsBackboneEmitter } from 'vue-events-backbone';
const yourEmitterGeneratorFnVariable: EventsBackboneEmitterGenerator | undefined = inject(createEventsBackboneEmitter);
const yourEmitterRef: Ref<EventsBackboneEmitter | undefined> = ref();
```
yourEmitterRef hasn't necessarily to be a ref, it's sufficient to store the generated emitter function in a simple variable.

**if yourEmitterGeneratorFnVariable is undefined, there is some problem with your plugin installation**

2) **inside one of the component lifecycle hooks**, invoke yourEmitterGeneratorFnVariable to generate the emitter function for your custom events :
```
onMounted(() => {
  yourEmitterRef.value = yourEmitterGeneratorFnVariable ? yourEmitterGeneratorFnVariable("yourEventName") : undefined;
})
```
**it must be invoked inside a lifecycle hook because internally it requires access to the current component instance.**

3) then when you want to emit the event, you'll have to simply call the Emitter Function created:

```
yourEmitterRef.value(yourCustomEventData?, global?: true | false(default), eager?: true(default) | false);
```

#### Emitter Function Usage

Every emitter function accepts three arguments: 
- the event data you want to pass 
- global: if **true** the event will be emitted globally. (default false).
- eager: if **false** the internal handler caller will await for eventual asynchronous handlers before proceeding.
(default is true, so it will not await for promises)

The emitter function, when called, returns a Promise<void> when the handler caller will finish to call all the handlers.

remember to check if yourEmitterRef has the function, because, in case of problems installing the plugin,
**yourEmitterGeneratorFnVariable** will be undefined and consequently "**yourEmitterRef.value**" will also be undefined.

### 3.1 THE EventsBackboneEmitterGenerator FUNCTION

The EventsBackboneEmitterGenerator function stored in "yourEmitterGeneratorFnVariable" takes one parameter of type: string | Array<string>
1) if a single string is passed, **yourEmitterRef.value** will store a single emitter function to call
2) if an Array<string> is passed, **yourEmitterRef.value** will store an object containing all emitter functions.
  EG:
```
onMounted(() => {
  yourEmitterRef1.value = yourEmitterGeneratorFnVariable ? yourEmitterGeneratorFnVariable(["app:foo", "app:bar"]) : undefined;
  yourEmitterRef2.value = yourEmitterGeneratorFnVariable ? yourEmitterGeneratorFnVariable("app:baz") : undefined;
})
// yourEmitterRef1.value contains { "app:foo": emitterFunction1, "app:bar": emitterFunction2 } (if yourEmitterGeneratorFnVariable is not undefined obviously)
// yourEmitterRef2.value contains just the function to call in order to emit the event
// so to emit "app:foo" event:
// yourEmitterRef1.value["app:foo"](yourCustomEventData, ifGlobal, ifNotEager)
//
// instead in order to emit "app:baz" event:
// yourEmitterRef2.value(yourCustomEventData, ifGlobal, ifNotEager)
```

### 4. NEW EVENTS NAMING SEMANTIC AND LISTEN ALL EVENTS KEYWORD

#### LISTEN ALL

In order to listen for all custom events emitted through the Event Backbone Emitter Functions, the eventName used in the directive
must be "*".
EG: 
```
<template>
  <YourComponentRootTag v-nameOfYourChoice="{'*': [{ handler: theHandlerFn, options?: EventsBackboneHandlerOption }, ...], 'eventName2': ...}">
    ...
```
In this way YourComponent will listen for all events emitted from one of its children (or for all events emitted globally).

#### NEW EVENTS NAME SEMANTIC

I decided to give to developers the possibility to define an "Event Hierarchy" directily with the event name.

More specifically, if I register an **x:y:z** event with the directive (see point 2) I'm defining a "tree-branch" with "x" being the root, "y" being a node and "z" being the leaf.

In this way a component that listens for "x:y" event, will be triggered by all events emitted that have "x:y" as their parents.

For example: "x:y" itself, "x:y:z", "x:y:foo:bar", etc. 

However, it won't be triggered by events like "y:x", "y", "z:x:y" and so on. The emitted event has to 
specify the exact branch from the root node.

This implies also that a component listening for event "x" is like a "listen all" specific for events belonging to "x" root.
In this way, developers can build a more complex event-based components design more clearly and easily.

It is noteworthy also that if a component listens for "x:y" event and "x" event at the same time, both will be triggered by
an event with "x:y" parents, from bottom to top. So "x:y" handlers will be executed before "x" handlers.

### EVENT NAMING RULES:

Considered the new event name meaning, there are some rules to follow when choosing the event name to listen for: 
- the listen all "\*" must be alone. So "*:whatever" is forbidden.
- the name cannot have trailing ":". ":whatever", "whatever:" are forbidden
- consequent colons or colons separated by spaces are forbidden. So no "what::ever" or "what:  :ever".

In each of these cases, the directive will throw an error and it will not register that specific event listener.
All valid names will still be registered

### 5. NOTES ON EventsBackboneSpineEvent OBJECT

The event emitted will be described by a "**EventsBackboneSpineEvent**" object that will be passed as parameter of each
event handler to call. This object will contain:

`emitterComponentInstance: ComponentInternalInstance
    handlerCallerComponentInstance: ComponentInternalInstance
    eventName: string
    branchSymbols: Array<Symbol>
    eventData?: any
    global?: boolean
    propagationStopped?: boolean | null
    eager?: boolean | null
    stopPropagation: (() => void)
    once: (() => void)
    transformEvent: ((newName: string, newData?: any) => void)`


1) **emitterComponentInstance**: the instance of the component that emitted the event 
2) **handlerCallerComponentInstance**: the instance of the component currently handling the event
3) **eventName**: the event name
4) **eventData**: the data passed through (optional)
5) **branchSymbols**: an array of symbols referring to the events hierarchy (MESS WITH IT AT YOUR OWN RISK)
6) **global**: if event has been emitted globally as opposed to the default backbone behaviour that 
follows the components tree branch from the emitter child to the root (optional, default false).
7) **propagationStopped**: if propagation has been stopped (useful if other handlers have been registered for the same event and component)
8) **eager**: if the handlers caller function is awaiting handlers execution (in case of async handlers)
9) **stopPropagation**: function to call inside the handler to stop propagation of the custom event
10) **once**: function to call inside the handler to unregister it once executed.
11) **transformEvent**: function to transform current handled event into another event.

The transformEvent function takes two parameters:
1) the new event name (required, hierarchy is valid and naming rules will be applied)
2) the new data to pass with the new event (optional, if nothing is passed old data will be kept)

It is noteworthy that the **once** function works with the original event, not the transformed event.
So for example, if I emitted **"x:y"** event, inside one of the handlers **transformEvent** has been called
with **new event name = "foo:bar"** and inside the same handler, after transformEvent, **once** has been called: the once function
will take effect for the original **"x:y"** event.

### OLD STYLE HANDLER OPTIONS (no more available starting from version 2.0.0)

When registering a handler through the directive, in addition to the handler you can insert an options key containing an EventsBackboneHandlerOption object.

The type EventsBackboneHandlerOption accept two optional properties that can be both a function (accepting a **EventsBackboneSpineEvent** parameter) or a
boolean:

- **stopPropagation**
- **once**

If one of these properties is undefined or null, it'll be considered falsy and not applied.

Eg.
```
{ handler: theHandlerFn, options: { stopPropagation: (be: EventsBackboneSpineEvent) => { return true }, once: true } }
```

### GENERAL NOTES:

- **stopPropagation** option will NOT work if the event is emitted with global: true, as in this case it's notpossible to consistently decide
the order of handlers to call;
- **once** option will unregister ONLY the specific handler for which the option is set, even if a component have registered
more different handlers for the same event.
