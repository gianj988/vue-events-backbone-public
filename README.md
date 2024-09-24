**1.1.1 CHANGES (backwards compatible)**: 
- now the **EventsBackboneSpineEvent** parameter passed to the handler function, will have 
**stopPropagation** and **once** functions that can be called directly inside the handler (for a more natural native events handling).
These two functions will directly set to true the respective value, overriding the relative handler option.
However, stopPropagation will still depend on the global modifier, if the event emitted is global, stopPropagation will not 
be set to true even if the handler inside calls ".stopPropagation()"
Old handler options system is still working as always.

- Better directive unexpected value type explanation.

**1.2.0 CHANGES {backwards compatible}**:
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

### UPCOMING CHANGES

- allow to define multiple emitter functions instead of calling the generator for each single event.
- other internal refactoring and optimizations.
- the bugfix for the bug previously noted.

# EventsBackbone

In Vue, custom events do not propagate through the components branch. A simple solution to this problem
is Dependency Injection with Provide/Inject to make component functions and properties available to
its children.

This plugin is essentially an **Event Bus** at its main core, but it is made to **simulate the DOM events propagation** 
through vue components, including "**stopPropagation**" and "**once**" options for emitted events.
This plugin does not need dependencies at all and it is developed for Vue3.
To keep things separated, the EventsBackbone plugin **DOES NOT USE DOM events or vue emitters**, instead events are only keys 
registered on the queue that are being used to register handlers to call.

The event emitted can have data passed as payload, that will be incapsulated in a "**EventsBackboneSpineEvent**"
object containing: 
1) the instance of the component that emitted the event 
2) the instance of the component currently handling the event
3) the event name
4) the data passed through (optional)
5) if event has been emitted globally as opposed to the default backbone behaviour that 
follows the components tree branch from the emitter child to the root (optional, default false).
6) if propagation has been stopped (useful if other handlers have been registered for the same event and component)
7) eager if the handlers caller function is awaiting handlers execution (in case of async handlers)
8) stopPropagation function to call inside the handler to stop propagation of the custom event
9) once function to call inside the handler to unregister it once executed.

This object will then be passed as argument to all handlers registered for the specified event.

Registered handlers can have **stopPropagation** and **once** as modifiers, both false by default. These 
options can be both a boolean or a function returning a boolean. In this second case, the BackboneEvent object 
will be passed as argument of the function.

On the other hand, the emitter component can emit an event in deafult mode (following the components tree branch)
or to emit the event globally.

The plugin is made to be easily used. It will export:

- **the plugin installer to install with app.use()**
- **the plugin directive to register on the app with app.directive()**, that will be used to register event listeners on those components that need to
- **useBackbone** function that will return the internal EventsBackbone instance. This is for a more precise control of the mechanism
- **createEventsBackboneEmitter**, a Symbol that it's meant to be used for injecting the **EventsBackboneEmit** function. This
must be called in a component lifecycle hook as it uses getCurrentInstance() internally.

### INSTALL THE PLUGIN ON YOUR VUE APP

To install the plugin and the directive you have to import these two references:

```
import installEventsBackbone, { EventsBackBoneDirective } from 'vue-events-backbone';
```

then:

```
app.use(installEventsBackbone);
app.directive("nameOfYourChoice", EventsBackBoneDirective);
```

### REGISTER EVENT LISTENERS USING THE DIRECTIVE

On the components for which you want to register the handler:
```
<template>
  <YourComponentRootTag v-nameOfYourChoice="{'eventName1': [{ handler: theHandlerFn, options?: EventsBackboneHandlerOption }, ...], 'eventName2': ...}">
    ...
  </YourComponentRootTag>
</template>
```

The directive handles the on/off of registered event listeners, according to the component lifecycle.
It is advised to place the directive on the root tag of the component, although it should work anyway

**AAA see known bugs section on top of this readme**

The type EventsBackboneHandlerOption accept two optional properties that can be both a function (accepting a **EventsBackboneSpineEvent** parameter) or a
boolean:

- **stopPropagation**
- **once**

If one of these properties is undefined or null, it'll be considered falsy and not applied.

Eg.
```
{ handler: theHandlerFn, options: { stopPropagation: (be: EventsBackboneSpineEvent) => { return true }, once: true } }
```

**IMPORTANT NOTE: theHandlerFn must take a parameter of EventsBackboneSpineEvent type (importable from this package)**

### EMIT CUSTOM EVENTS WITH DATA FROM A CHILD COMPONENT

On components from which you want to emit events through the EventsBackbone, you'll have to:
1) import the injection key for the createEmitter function: 
```
import { createEventsBackboneEmitter } from 'vue-events-backbone';
const yourCustomVariable: EventsBackboneEmitterGenerator | undefined = inject(createEventsBackboneEmitter);
const yourEmitterRef: Ref<EventsBackboneEmitter | undefined> = ref();
```
NOTE: if yourCustomVariable is undefined, there is some problem with your plugin installation

2) inside one of component lifecycle hooks:
```
onMounted(() => {
  yourEmitterRef.value = yourCustomVariable ? yourCustomVariable("yourEventName") : undefined;
})
```

yourEmitterRef hasn't necessarily to be a ref, it's sufficient to store the generated emitter function in a simple variable.

The createEmitter function accept the event name and returns the emitter function.

The emitter function, on its own accepts two arguments: the event data you want to pass and if the event has to be global (default false).

The emitter function, when called, will return a Promise<void> when the backbone will finish to call all the handlers.

3) then when you want to emit the event, you'll have to simply call the Emitter Function:

```
yourEmitterRef.value(yourCustomEventData?, global?: true | false(default), eager?: true(default) | false);
```
remember to check if yourEmitterRef has the function, because, in case of problems installing the plugin,
**yourCustomVariable** will be undefined and consequently "**yourEmitterRef.value**" will also be undefined.

**The developer will have to create an emitter function for all events he'll want to emit through the EventsBackbone. Once created, the emitter function**
**can be called as many times as needed**
Eg:

I'm going to emit a "foo" event and a "bar" event from a component.
Inside the lifecycle hook I will write:
```
onBeforeMount(() => {
  fooEmitter.value = yourCustomVariable ? yourCustomVariable("foo") : undefined;
  barEmitter.value = yourCustomVariable ? yourCustomVariable("bar") : undefined;
})
```

from now on, I'll have those two emitter functions to call whenever I want.

### GENERAL NOTES:

- **stopPropagation** option will NOT work if the event is emitted with global: true, as in this case it's notpossible to consistently decide
the order of handlers to call;
- **once** option will unregister ONLY the specific handler for which the option is set, even if a component have registered
more different handlers for the same event.
