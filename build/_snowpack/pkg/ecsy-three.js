import { n as now, q as queryKey, Q as Query, E as EventDispatcher, b as SystemStateComponent, h as hasWindow, C as Component, a as Types, T as TagComponent, c as createType, d as copyCopyable, e as cloneClonable } from './common/index-cca84c5b.js';
import { B as Box3, C as Color, a as Cylindrical, E as Euler, F as Frustum, L as Line3, M as Matrix3, b as Matrix4, P as Plane, Q as Quaternion, R as Ray, S as Sphere, c as Spherical, d as SphericalHarmonics3, T as Triangle, V as Vector2, e as Vector3, f as Vector4, g as Box2 } from './common/three.module-c434307a.js';

class SystemManager {
  constructor(world) {
    this._systems = [];
    this._executeSystems = []; // Systems that have `execute` method
    this.world = world;
    this.lastExecutedSystem = null;
  }

  registerSystem(SystemClass, attributes) {
    if (!SystemClass.isSystem) {
      throw new Error(
        `System '${SystemClass.name}' does not extend 'System' class`
      );
    }

    if (this.getSystem(SystemClass) !== undefined) {
      console.warn(`System '${SystemClass.getName()}' already registered.`);
      return this;
    }

    var system = new SystemClass(this.world, attributes);
    if (system.init) system.init(attributes);
    system.order = this._systems.length;
    this._systems.push(system);
    if (system.execute) {
      this._executeSystems.push(system);
      this.sortSystems();
    }
    return this;
  }

  unregisterSystem(SystemClass) {
    let system = this.getSystem(SystemClass);
    if (system === undefined) {
      console.warn(
        `Can unregister system '${SystemClass.getName()}'. It doesn't exist.`
      );
      return this;
    }

    this._systems.splice(this._systems.indexOf(system), 1);

    if (system.execute) {
      this._executeSystems.splice(this._executeSystems.indexOf(system), 1);
    }

    // @todo Add system.unregister() call to free resources
    return this;
  }

  sortSystems() {
    this._executeSystems.sort((a, b) => {
      return a.priority - b.priority || a.order - b.order;
    });
  }

  getSystem(SystemClass) {
    return this._systems.find((s) => s instanceof SystemClass);
  }

  getSystems() {
    return this._systems;
  }

  removeSystem(SystemClass) {
    var index = this._systems.indexOf(SystemClass);
    if (!~index) return;

    this._systems.splice(index, 1);
  }

  executeSystem(system, delta, time) {
    if (system.initialized) {
      if (system.canExecute()) {
        let startTime = now();
        system.execute(delta, time);
        system.executeTime = now() - startTime;
        this.lastExecutedSystem = system;
        system.clearEvents();
      }
    }
  }

  stop() {
    this._executeSystems.forEach((system) => system.stop());
  }

  execute(delta, time, forcePlay) {
    this._executeSystems.forEach(
      (system) =>
        (forcePlay || system.enabled) && this.executeSystem(system, delta, time)
    );
  }

  stats() {
    var stats = {
      numSystems: this._systems.length,
      systems: {},
    };

    for (var i = 0; i < this._systems.length; i++) {
      var system = this._systems[i];
      var systemStats = (stats.systems[system.getName()] = {
        queries: {},
        executeTime: system.executeTime,
      });
      for (var name in system.ctx) {
        systemStats.queries[name] = system.ctx[name].stats();
      }
    }

    return stats;
  }
}

class ObjectPool {
  // @todo Add initial size
  constructor(T, initialSize) {
    this.freeList = [];
    this.count = 0;
    this.T = T;
    this.isObjectPool = true;

    if (typeof initialSize !== "undefined") {
      this.expand(initialSize);
    }
  }

  acquire() {
    // Grow the list by 20%ish if we're out
    if (this.freeList.length <= 0) {
      this.expand(Math.round(this.count * 0.2) + 1);
    }

    var item = this.freeList.pop();

    return item;
  }

  release(item) {
    item.reset();
    this.freeList.push(item);
  }

  expand(count) {
    for (var n = 0; n < count; n++) {
      var clone = new this.T();
      clone._pool = this;
      this.freeList.push(clone);
    }
    this.count += count;
  }

  totalSize() {
    return this.count;
  }

  totalFree() {
    return this.freeList.length;
  }

  totalUsed() {
    return this.count - this.freeList.length;
  }
}

/**
 * @private
 * @class QueryManager
 */
class QueryManager {
  constructor(world) {
    this._world = world;

    // Queries indexed by a unique identifier for the components it has
    this._queries = {};
  }

  onEntityRemoved(entity) {
    for (var queryName in this._queries) {
      var query = this._queries[queryName];
      if (entity.queries.indexOf(query) !== -1) {
        query.removeEntity(entity);
      }
    }
  }

  /**
   * Callback when a component is added to an entity
   * @param {Entity} entity Entity that just got the new component
   * @param {Component} Component Component added to the entity
   */
  onEntityComponentAdded(entity, Component) {
    // @todo Use bitmask for checking components?

    // Check each indexed query to see if we need to add this entity to the list
    for (var queryName in this._queries) {
      var query = this._queries[queryName];

      if (
        !!~query.NotComponents.indexOf(Component) &&
        ~query.entities.indexOf(entity)
      ) {
        query.removeEntity(entity);
        continue;
      }

      // Add the entity only if:
      // Component is in the query
      // and Entity has ALL the components of the query
      // and Entity is not already in the query
      if (
        !~query.Components.indexOf(Component) ||
        !query.match(entity) ||
        ~query.entities.indexOf(entity)
      )
        continue;

      query.addEntity(entity);
    }
  }

  /**
   * Callback when a component is removed from an entity
   * @param {Entity} entity Entity to remove the component from
   * @param {Component} Component Component to remove from the entity
   */
  onEntityComponentRemoved(entity, Component) {
    for (var queryName in this._queries) {
      var query = this._queries[queryName];

      if (
        !!~query.NotComponents.indexOf(Component) &&
        !~query.entities.indexOf(entity) &&
        query.match(entity)
      ) {
        query.addEntity(entity);
        continue;
      }

      if (
        !!~query.Components.indexOf(Component) &&
        !!~query.entities.indexOf(entity) &&
        !query.match(entity)
      ) {
        query.removeEntity(entity);
        continue;
      }
    }
  }

  /**
   * Get a query for the specified components
   * @param {Component} Components Components that the query should have
   */
  getQuery(Components) {
    var key = queryKey(Components);
    var query = this._queries[key];
    if (!query) {
      this._queries[key] = query = new Query(Components, this._world);
    }
    return query;
  }

  /**
   * Return some stats from this class
   */
  stats() {
    var stats = {};
    for (var queryName in this._queries) {
      stats[queryName] = this._queries[queryName].stats();
    }
    return stats;
  }
}

class EntityPool extends ObjectPool {
  constructor(entityManager, entityClass, initialSize) {
    super(entityClass, undefined);
    this.entityManager = entityManager;

    if (typeof initialSize !== "undefined") {
      this.expand(initialSize);
    }
  }

  expand(count) {
    for (var n = 0; n < count; n++) {
      var clone = new this.T(this.entityManager);
      clone._pool = this;
      this.freeList.push(clone);
    }
    this.count += count;
  }
}

/**
 * @private
 * @class EntityManager
 */
class EntityManager {
  constructor(world) {
    this.world = world;
    this.componentsManager = world.componentsManager;

    // All the entities in this instance
    this._entities = [];
    this._nextEntityId = 0;

    this._entitiesByNames = {};

    this._queryManager = new QueryManager(this);
    this.eventDispatcher = new EventDispatcher();
    this._entityPool = new EntityPool(
      this,
      this.world.options.entityClass,
      this.world.options.entityPoolSize
    );

    // Deferred deletion
    this.entitiesWithComponentsToRemove = [];
    this.entitiesToRemove = [];
    this.deferredRemovalEnabled = true;
  }

  getEntityByName(name) {
    return this._entitiesByNames[name];
  }

  /**
   * Create a new entity
   */
  createEntity(name) {
    var entity = this._entityPool.acquire();
    entity.alive = true;
    entity.name = name || "";
    if (name) {
      if (this._entitiesByNames[name]) {
        console.warn(`Entity name '${name}' already exist`);
      } else {
        this._entitiesByNames[name] = entity;
      }
    }

    this._entities.push(entity);
    this.eventDispatcher.dispatchEvent(ENTITY_CREATED, entity);
    return entity;
  }

  // COMPONENTS

  /**
   * Add a component to an entity
   * @param {Entity} entity Entity where the component will be added
   * @param {Component} Component Component to be added to the entity
   * @param {Object} values Optional values to replace the default attributes
   */
  entityAddComponent(entity, Component, values) {
    // @todo Probably define Component._typeId with a default value and avoid using typeof
    if (
      typeof Component._typeId === "undefined" &&
      !this.world.componentsManager._ComponentsMap[Component._typeId]
    ) {
      throw new Error(
        `Attempted to add unregistered component "${Component.getName()}"`
      );
    }

    if (~entity._ComponentTypes.indexOf(Component)) {
      return;
    }

    entity._ComponentTypes.push(Component);

    if (Component.__proto__ === SystemStateComponent) {
      entity.numStateComponents++;
    }

    var componentPool = this.world.componentsManager.getComponentsPool(
      Component
    );

    var component = componentPool
      ? componentPool.acquire()
      : new Component(values);

    if (componentPool && values) {
      component.copy(values);
    }

    entity._components[Component._typeId] = component;

    this._queryManager.onEntityComponentAdded(entity, Component);
    this.world.componentsManager.componentAddedToEntity(Component);

    this.eventDispatcher.dispatchEvent(COMPONENT_ADDED, entity, Component);
  }

  /**
   * Remove a component from an entity
   * @param {Entity} entity Entity which will get removed the component
   * @param {*} Component Component to remove from the entity
   * @param {Bool} immediately If you want to remove the component immediately instead of deferred (Default is false)
   */
  entityRemoveComponent(entity, Component, immediately) {
    var index = entity._ComponentTypes.indexOf(Component);
    if (!~index) return;

    this.eventDispatcher.dispatchEvent(COMPONENT_REMOVE, entity, Component);

    if (immediately) {
      this._entityRemoveComponentSync(entity, Component, index);
    } else {
      if (entity._ComponentTypesToRemove.length === 0)
        this.entitiesWithComponentsToRemove.push(entity);

      entity._ComponentTypes.splice(index, 1);
      entity._ComponentTypesToRemove.push(Component);

      entity._componentsToRemove[Component._typeId] =
        entity._components[Component._typeId];
      delete entity._components[Component._typeId];
    }

    // Check each indexed query to see if we need to remove it
    this._queryManager.onEntityComponentRemoved(entity, Component);

    if (Component.__proto__ === SystemStateComponent) {
      entity.numStateComponents--;

      // Check if the entity was a ghost waiting for the last system state component to be removed
      if (entity.numStateComponents === 0 && !entity.alive) {
        entity.remove();
      }
    }
  }

  _entityRemoveComponentSync(entity, Component, index) {
    // Remove T listing on entity and property ref, then free the component.
    entity._ComponentTypes.splice(index, 1);
    var component = entity._components[Component._typeId];
    delete entity._components[Component._typeId];
    component.dispose();
    this.world.componentsManager.componentRemovedFromEntity(Component);
  }

  /**
   * Remove all the components from an entity
   * @param {Entity} entity Entity from which the components will be removed
   */
  entityRemoveAllComponents(entity, immediately) {
    let Components = entity._ComponentTypes;

    for (let j = Components.length - 1; j >= 0; j--) {
      if (Components[j].__proto__ !== SystemStateComponent)
        this.entityRemoveComponent(entity, Components[j], immediately);
    }
  }

  /**
   * Remove the entity from this manager. It will clear also its components
   * @param {Entity} entity Entity to remove from the manager
   * @param {Bool} immediately If you want to remove the component immediately instead of deferred (Default is false)
   */
  removeEntity(entity, immediately) {
    var index = this._entities.indexOf(entity);

    if (!~index) throw new Error("Tried to remove entity not in list");

    entity.alive = false;
    this.entityRemoveAllComponents(entity, immediately);

    if (entity.numStateComponents === 0) {
      // Remove from entity list
      this.eventDispatcher.dispatchEvent(ENTITY_REMOVED, entity);
      this._queryManager.onEntityRemoved(entity);
      if (immediately === true) {
        this._releaseEntity(entity, index);
      } else {
        this.entitiesToRemove.push(entity);
      }
    }
  }

  _releaseEntity(entity, index) {
    this._entities.splice(index, 1);

    if (this._entitiesByNames[entity.name]) {
      delete this._entitiesByNames[entity.name];
    }
    entity._pool.release(entity);
  }

  /**
   * Remove all entities from this manager
   */
  removeAllEntities() {
    for (var i = this._entities.length - 1; i >= 0; i--) {
      this.removeEntity(this._entities[i]);
    }
  }

  processDeferredRemoval() {
    if (!this.deferredRemovalEnabled) {
      return;
    }

    for (let i = 0; i < this.entitiesToRemove.length; i++) {
      let entity = this.entitiesToRemove[i];
      let index = this._entities.indexOf(entity);
      this._releaseEntity(entity, index);
    }
    this.entitiesToRemove.length = 0;

    for (let i = 0; i < this.entitiesWithComponentsToRemove.length; i++) {
      let entity = this.entitiesWithComponentsToRemove[i];
      while (entity._ComponentTypesToRemove.length > 0) {
        let Component = entity._ComponentTypesToRemove.pop();

        var component = entity._componentsToRemove[Component._typeId];
        delete entity._componentsToRemove[Component._typeId];
        component.dispose();
        this.world.componentsManager.componentRemovedFromEntity(Component);

        //this._entityRemoveComponentSync(entity, Component, index);
      }
    }

    this.entitiesWithComponentsToRemove.length = 0;
  }

  /**
   * Get a query based on a list of components
   * @param {Array(Component)} Components List of components that will form the query
   */
  queryComponents(Components) {
    return this._queryManager.getQuery(Components);
  }

  // EXTRAS

  /**
   * Return number of entities
   */
  count() {
    return this._entities.length;
  }

  /**
   * Return some stats
   */
  stats() {
    var stats = {
      numEntities: this._entities.length,
      numQueries: Object.keys(this._queryManager._queries).length,
      queries: this._queryManager.stats(),
      numComponentPool: Object.keys(this.componentsManager._componentPool)
        .length,
      componentPool: {},
      eventDispatcher: this.eventDispatcher.stats,
    };

    for (var ecsyComponentId in this.componentsManager._componentPool) {
      var pool = this.componentsManager._componentPool[ecsyComponentId];
      stats.componentPool[pool.T.getName()] = {
        used: pool.totalUsed(),
        size: pool.count,
      };
    }

    return stats;
  }
}

const ENTITY_CREATED = "EntityManager#ENTITY_CREATE";
const ENTITY_REMOVED = "EntityManager#ENTITY_REMOVED";
const COMPONENT_ADDED = "EntityManager#COMPONENT_ADDED";
const COMPONENT_REMOVE = "EntityManager#COMPONENT_REMOVE";

class ComponentManager {
  constructor() {
    this.Components = [];
    this._ComponentsMap = {};

    this._componentPool = {};
    this.numComponents = {};
    this.nextComponentId = 0;
  }

  hasComponent(Component) {
    return this.Components.indexOf(Component) !== -1;
  }

  registerComponent(Component, objectPool) {
    if (this.Components.indexOf(Component) !== -1) {
      console.warn(
        `Component type: '${Component.getName()}' already registered.`
      );
      return;
    }

    const schema = Component.schema;

    if (!schema) {
      throw new Error(
        `Component "${Component.getName()}" has no schema property.`
      );
    }

    for (const propName in schema) {
      const prop = schema[propName];

      if (!prop.type) {
        throw new Error(
          `Invalid schema for component "${Component.getName()}". Missing type for "${propName}" property.`
        );
      }
    }

    Component._typeId = this.nextComponentId++;
    this.Components.push(Component);
    this._ComponentsMap[Component._typeId] = Component;
    this.numComponents[Component._typeId] = 0;

    if (objectPool === undefined) {
      objectPool = new ObjectPool(Component);
    } else if (objectPool === false) {
      objectPool = undefined;
    }

    this._componentPool[Component._typeId] = objectPool;
  }

  componentAddedToEntity(Component) {
    this.numComponents[Component._typeId]++;
  }

  componentRemovedFromEntity(Component) {
    this.numComponents[Component._typeId]--;
  }

  getComponentsPool(Component) {
    return this._componentPool[Component._typeId];
  }
}

const Version = "0.3.1";

class Entity {
  constructor(entityManager) {
    this._entityManager = entityManager || null;

    // Unique ID for this entity
    this.id = entityManager._nextEntityId++;

    // List of components types the entity has
    this._ComponentTypes = [];

    // Instance of the components
    this._components = {};

    this._componentsToRemove = {};

    // Queries where the entity is added
    this.queries = [];

    // Used for deferred removal
    this._ComponentTypesToRemove = [];

    this.alive = false;

    //if there are state components on a entity, it can't be removed completely
    this.numStateComponents = 0;
  }

  // COMPONENTS

  getComponent(Component, includeRemoved) {
    var component = this._components[Component._typeId];

    if (!component && includeRemoved === true) {
      component = this._componentsToRemove[Component._typeId];
    }

    return component;
  }

  getRemovedComponent(Component) {
    const component = this._componentsToRemove[Component._typeId];

    return component;
  }

  getComponents() {
    return this._components;
  }

  getComponentsToRemove() {
    return this._componentsToRemove;
  }

  getComponentTypes() {
    return this._ComponentTypes;
  }

  getMutableComponent(Component) {
    var component = this._components[Component._typeId];

    if (!component) {
      return;
    }

    for (var i = 0; i < this.queries.length; i++) {
      var query = this.queries[i];
      // @todo accelerate this check. Maybe having query._Components as an object
      // @todo add Not components
      if (query.reactive && query.Components.indexOf(Component) !== -1) {
        query.eventDispatcher.dispatchEvent(
          Query.prototype.COMPONENT_CHANGED,
          this,
          component
        );
      }
    }
    return component;
  }

  addComponent(Component, values) {
    this._entityManager.entityAddComponent(this, Component, values);
    return this;
  }

  removeComponent(Component, forceImmediate) {
    this._entityManager.entityRemoveComponent(this, Component, forceImmediate);
    return this;
  }

  hasComponent(Component, includeRemoved) {
    return (
      !!~this._ComponentTypes.indexOf(Component) ||
      (includeRemoved === true && this.hasRemovedComponent(Component))
    );
  }

  hasRemovedComponent(Component) {
    return !!~this._ComponentTypesToRemove.indexOf(Component);
  }

  hasAllComponents(Components) {
    for (var i = 0; i < Components.length; i++) {
      if (!this.hasComponent(Components[i])) return false;
    }
    return true;
  }

  hasAnyComponents(Components) {
    for (var i = 0; i < Components.length; i++) {
      if (this.hasComponent(Components[i])) return true;
    }
    return false;
  }

  removeAllComponents(forceImmediate) {
    return this._entityManager.entityRemoveAllComponents(this, forceImmediate);
  }

  copy(src) {
    // TODO: This can definitely be optimized
    for (var ecsyComponentId in src._components) {
      var srcComponent = src._components[ecsyComponentId];
      this.addComponent(srcComponent.constructor);
      var component = this.getComponent(srcComponent.constructor);
      component.copy(srcComponent);
    }

    return this;
  }

  clone() {
    return new Entity(this._entityManager).copy(this);
  }

  reset() {
    this.id = this._entityManager._nextEntityId++;
    this._ComponentTypes.length = 0;
    this.queries.length = 0;

    for (var ecsyComponentId in this._components) {
      delete this._components[ecsyComponentId];
    }
  }

  remove(forceImmediate) {
    return this._entityManager.removeEntity(this, forceImmediate);
  }
}

const DEFAULT_OPTIONS = {
  entityPoolSize: 0,
  entityClass: Entity,
};

class World {
  constructor(options = {}) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);

    this.componentsManager = new ComponentManager(this);
    this.entityManager = new EntityManager(this);
    this.systemManager = new SystemManager(this);

    this.enabled = true;

    this.eventQueues = {};

    if (hasWindow && typeof CustomEvent !== "undefined") {
      var event = new CustomEvent("ecsy-world-created", {
        detail: { world: this, version: Version },
      });
      window.dispatchEvent(event);
    }

    this.lastTime = now() / 1000;
  }

  registerComponent(Component, objectPool) {
    this.componentsManager.registerComponent(Component, objectPool);
    return this;
  }

  registerSystem(System, attributes) {
    this.systemManager.registerSystem(System, attributes);
    return this;
  }

  hasRegisteredComponent(Component) {
    return this.componentsManager.hasComponent(Component);
  }

  unregisterSystem(System) {
    this.systemManager.unregisterSystem(System);
    return this;
  }

  getSystem(SystemClass) {
    return this.systemManager.getSystem(SystemClass);
  }

  getSystems() {
    return this.systemManager.getSystems();
  }

  execute(delta, time) {
    if (!delta) {
      time = now() / 1000;
      delta = time - this.lastTime;
      this.lastTime = time;
    }

    if (this.enabled) {
      this.systemManager.execute(delta, time);
      this.entityManager.processDeferredRemoval();
    }
  }

  stop() {
    this.enabled = false;
  }

  play() {
    this.enabled = true;
  }

  createEntity(name) {
    return this.entityManager.createEntity(name);
  }

  stats() {
    var stats = {
      entities: this.entityManager.stats(),
      system: this.systemManager.stats(),
    };

    return stats;
  }
}

class Object3DComponent extends Component {}

Object3DComponent.schema = {
  value: { type: Types.Ref },
};

// Tag components for every Object3D in the three.js core library

// audio
class AudioTagComponent extends TagComponent {}

class AudioListenerTagComponent extends TagComponent {}

class PositionalAudioTagComponent extends TagComponent {}

// cameras
class ArrayCameraTagComponent extends TagComponent {}

class CameraTagComponent extends TagComponent {}

class CubeCameraTagComponent extends TagComponent {}

class OrthographicCameraTagComponent extends TagComponent {}

class PerspectiveCameraTagComponent extends TagComponent {}

// extras/objects
class ImmediateRenderObjectTagComponent extends TagComponent {}

// helpers

// Due to inconsistency in implementing consistent identifying properties like "type" on helpers, we've
// chosen to exclude helper tag components.

// lights
class AmbientLightTagComponent extends TagComponent {}

class AmbientLightProbeTagComponent extends TagComponent {}

class DirectionalLightTagComponent extends TagComponent {}

class HemisphereLightTagComponent extends TagComponent {}

class HemisphereLightProbeTagComponent extends TagComponent {}

class LightTagComponent extends TagComponent {}

class LightProbeTagComponent extends TagComponent {}

class PointLightTagComponent extends TagComponent {}

class RectAreaLightTagComponent extends TagComponent {}

class SpotLightTagComponent extends TagComponent {}

// objects
class BoneTagComponent extends TagComponent {}

class GroupTagComponent extends TagComponent {}

class InstancedMeshTagComponent extends TagComponent {}

class LODTagComponent extends TagComponent {}

class LineTagComponent extends TagComponent {}

class LineLoopTagComponent extends TagComponent {}

class LineSegmentsTagComponent extends TagComponent {}

class MeshTagComponent extends TagComponent {}
class PointsTagComponent extends TagComponent {}

class SkinnedMeshTagComponent extends TagComponent {}

class SpriteTagComponent extends TagComponent {}

// scenes
class SceneTagComponent extends TagComponent {}

var Object3DTagComponents = /*#__PURE__*/Object.freeze({
  __proto__: null,
  AudioTagComponent: AudioTagComponent,
  AudioListenerTagComponent: AudioListenerTagComponent,
  PositionalAudioTagComponent: PositionalAudioTagComponent,
  ArrayCameraTagComponent: ArrayCameraTagComponent,
  CameraTagComponent: CameraTagComponent,
  CubeCameraTagComponent: CubeCameraTagComponent,
  OrthographicCameraTagComponent: OrthographicCameraTagComponent,
  PerspectiveCameraTagComponent: PerspectiveCameraTagComponent,
  ImmediateRenderObjectTagComponent: ImmediateRenderObjectTagComponent,
  AmbientLightTagComponent: AmbientLightTagComponent,
  AmbientLightProbeTagComponent: AmbientLightProbeTagComponent,
  DirectionalLightTagComponent: DirectionalLightTagComponent,
  HemisphereLightTagComponent: HemisphereLightTagComponent,
  HemisphereLightProbeTagComponent: HemisphereLightProbeTagComponent,
  LightTagComponent: LightTagComponent,
  LightProbeTagComponent: LightProbeTagComponent,
  PointLightTagComponent: PointLightTagComponent,
  RectAreaLightTagComponent: RectAreaLightTagComponent,
  SpotLightTagComponent: SpotLightTagComponent,
  BoneTagComponent: BoneTagComponent,
  GroupTagComponent: GroupTagComponent,
  InstancedMeshTagComponent: InstancedMeshTagComponent,
  LODTagComponent: LODTagComponent,
  LineTagComponent: LineTagComponent,
  LineLoopTagComponent: LineLoopTagComponent,
  LineSegmentsTagComponent: LineSegmentsTagComponent,
  MeshTagComponent: MeshTagComponent,
  PointsTagComponent: PointsTagComponent,
  SkinnedMeshTagComponent: SkinnedMeshTagComponent,
  SpriteTagComponent: SpriteTagComponent,
  SceneTagComponent: SceneTagComponent
});

class ECSYThreeEntity extends Entity {
  addObject3DComponent(obj, parentEntity) {
    obj.entity = this;

    this.addComponent(Object3DComponent, { value: obj });

    if (obj.type === "Audio" && obj.panner !== undefined) {
      this.addComponent(PositionalAudioTagComponent);
    } else if (obj.type === "Audio") {
      this.addComponent(AudioTagComponent);
    } else if (obj.type === "AudioListener") {
      this.addComponent(AudioListenerTagComponent);
    } else if (obj.isCamera) {
      this.addComponent(CameraTagComponent);

      if (obj.isOrthographicCamera) {
        this.addComponent(OrthographicCameraTagComponent);
      } else if (obj.isPerspectiveCamera) {
        this.addComponent(PerspectiveCameraTagComponent);

        if (obj.isArrayCamera) {
          this.addComponent(ArrayCameraTagComponent);
        }
      }
    } else if (obj.type === "CubeCamera") {
      this.addComponent(CubeCameraTagComponent);
    } else if (obj.isImmediateRenderObject) {
      this.addComponent(ImmediateRenderObjectTagComponent);
    } else if (obj.isLight) {
      this.addComponent(LightTagComponent);

      if (obj.isAmbientLight) {
        this.addComponent(AmbientLightTagComponent);
      } else if (obj.isDirectionalLight) {
        this.addComponent(DirectionalLightTagComponent);
      } else if (obj.isHemisphereLight) {
        this.addComponent(HemisphereLightTagComponent);
      } else if (obj.isPointLight) {
        this.addComponent(PointLightTagComponent);
      } else if (obj.isRectAreaLight) {
        this.addComponent(RectAreaLightTagComponent);
      } else if (obj.isSpotLight) {
        this.addComponent(SpotLightTagComponent);
      } else if (obj.isLightProbe) {
        this.addComponent(LightProbeTagComponent);

        if (obj.isAmbientLightProbe) {
          this.addComponent(AmbientLightProbeTagComponent);
        } else if (obj.isHemisphereLightProbe) {
          this.addComponent(HemisphereLightProbeTagComponent);
        }
      }
    } else if (obj.isBone) {
      this.addComponent(BoneTagComponent);
    } else if (obj.isGroup) {
      this.addComponent(GroupTagComponent);
    } else if (obj.isLOD) {
      this.addComponent(LODTagComponent);
    } else if (obj.isMesh) {
      this.addComponent(MeshTagComponent);

      if (obj.isInstancedMesh) {
        this.addComponent(InstancedMeshTagComponent);
      } else if (obj.isSkinnedMesh) {
        this.addComponent(SkinnedMeshTagComponent);
      }
    } else if (obj.isLine) {
      this.addComponent(LineTagComponent);

      if (obj.isLineLoop) {
        this.addComponent(LineLoopTagComponent);
      } else if (obj.isLineSegments) {
        this.addComponent(LineSegmentsTagComponent);
      }
    } else if (obj.isPoints) {
      this.addComponent(PointsTagComponent);
    } else if (obj.isSprite) {
      this.addComponent(SpriteTagComponent);
    } else if (obj.isScene) {
      this.addComponent(SceneTagComponent);
    }

    if (parentEntity && parentEntity.hasComponent(Object3DComponent)) {
      parentEntity.getObject3D().add(obj);
    }

    return this;
  }

  removeObject3DComponent(unparent = true) {
    const obj = this.getComponent(Object3DComponent, true).value;
    if (unparent) {
      // Using "true" as the entity could be removed somewhere else
      obj.parent && obj.parent.remove(obj);
    }
    this.removeComponent(Object3DComponent);

    for (let i = this._ComponentTypes.length - 1; i >= 0; i--) {
      const Component = this._ComponentTypes[i];

      if (Component.isObject3DTagComponent) {
        this.removeComponent(Component);
      }
    }

    obj.entity = null;
  }

  removeAllComponents(forceImmediate) {
    if (this.hasComponent(Object3DComponent)) {
      this.removeObject3DComponent();
    }

    return super.removeAllComponents(forceImmediate);
  }

  remove(forceImmediate) {
    if (this.hasComponent(Object3DComponent)) {
      const obj = this.getObject3D();
      obj.traverse((o) => {
        if (o.entity) {
          this._entityManager.removeEntity(o.entity, forceImmediate);
        }
        o.entity = null;
      });
      obj.parent && obj.parent.remove(obj);
    } else {
      this._entityManager.removeEntity(this, forceImmediate);
    }
  }

  getObject3D() {
    const component = this.getComponent(Object3DComponent);
    return component && component.value;
  }
}

class ECSYThreeWorld extends World {
  constructor(options) {
    super(
      Object.assign(
        {
          entityClass: ECSYThreeEntity,
        },
        options
      )
    );

    this.registerComponent(Object3DComponent);

    Object.values(Object3DTagComponents).forEach((Component) => {
      this.registerComponent(Component);
    });
  }
}

function defineClonableType(ClassName, ThreeClass) {
  return createType({
    name: ClassName,
    default: new ThreeClass(),
    copy: copyCopyable,
    clone: cloneClonable,
  });
}

// Types from the three.js core library
// All types must implement the copy and clone methods.
// Excludes Geometries, Object3Ds, Materials, and other types that require more
// advanced object pooling techniques

// math

defineClonableType("Box2", Box2);
defineClonableType("Box3", Box3);
defineClonableType("Color", Color);
defineClonableType("Cylindrical", Cylindrical);
defineClonableType("Euler", Euler);
defineClonableType("Frustum", Frustum);
defineClonableType("Line3", Line3);
defineClonableType("Matrix3", Matrix3);
defineClonableType("Matrix4", Matrix4);
defineClonableType("Plane", Plane);
defineClonableType("Quaternion", Quaternion);
defineClonableType("Ray", Ray);
defineClonableType("Sphere", Sphere);
defineClonableType("Spherical", Spherical);
defineClonableType(
  "SphericalHarmonics3",
  SphericalHarmonics3
);
defineClonableType("Triangle", Triangle);
defineClonableType("Vector2", Vector2);
defineClonableType("Vector3", Vector3);
defineClonableType("Vector4", Vector4);

export { ECSYThreeWorld };
