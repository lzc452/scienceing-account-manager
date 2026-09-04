true              &&(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
}());

/**
* @vue/shared v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(",")) map[key] = 1;
  return (val) => val in map;
}
const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const NOOP = () => {
};
const NO = () => false;
const isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // uppercase letter
(key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
const isModelListener = (key) => key.startsWith("onUpdate:");
const extend = Object.assign;
const remove = (arr, el) => {
  const i = arr.indexOf(el);
  if (i > -1) {
    arr.splice(i, 1);
  }
};
const hasOwnProperty$1 = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
const isArray$1 = Array.isArray;
const isMap = (val) => toTypeString(val) === "[object Map]";
const isSet = (val) => toTypeString(val) === "[object Set]";
const isDate = (val) => toTypeString(val) === "[object Date]";
const isFunction = (val) => typeof val === "function";
const isString = (val) => typeof val === "string";
const isSymbol = (val) => typeof val === "symbol";
const isObject = (val) => val !== null && typeof val === "object";
const isPromise = (val) => {
  return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
};
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
const isPlainObject = (val) => toTypeString(val) === "[object Object]";
const isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
);
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return ((str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  });
};
const camelizeRE = /-\w/g;
const camelize = cacheStringFunction(
  (str) => {
    return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
  }
);
const hyphenateRE = /\B([A-Z])/g;
const hyphenate = cacheStringFunction(
  (str) => str.replace(hyphenateRE, "-$1").toLowerCase()
);
const capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
const toHandlerKey = cacheStringFunction(
  (str) => {
    const s = str ? `on${capitalize(str)}` : ``;
    return s;
  }
);
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value
  });
};
const looseToNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? val : n;
};
const toNumber = (val) => {
  const n = isString(val) ? Number(val) : NaN;
  return isNaN(n) ? val : n;
};
let _globalThis;
const getGlobalThis = () => {
  return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
function normalizeStyle(value) {
  if (isArray$1(value)) {
    const res = {};
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key];
        }
      }
    }
    return res;
  } else if (isString(value) || isObject(value)) {
    return value;
  }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
  const ret = {};
  cssText.replace(styleCommentRE, "").split(listDelimiterRE).forEach((item) => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE);
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return ret;
}
function normalizeClass(value) {
  let res = "";
  if (isString(value)) {
    res = value;
  } else if (isArray$1(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + " ";
      }
    }
  }
  return res.trim();
}
const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
const isSpecialBooleanAttr = /* @__PURE__ */ makeMap(specialBooleanAttrs);
function includeBooleanAttr(value) {
  return !!value || value === "";
}
function looseCompareArrays(a, b) {
  if (a.length !== b.length) return false;
  let equal = true;
  for (let i = 0; equal && i < a.length; i++) {
    equal = looseEqual(a[i], b[i]);
  }
  return equal;
}
function looseCompareCollections(a, b) {
  if (a.size !== b.size) return false;
  const candidates = Array.from(b);
  const matched = new Uint8Array(candidates.length);
  for (const item of a) {
    let index = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (!matched[i] && looseEqual(item, candidates[i])) {
        index = i;
        break;
      }
    }
    if (index < 0) return false;
    matched[index] = 1;
  }
  return true;
}
function looseEqual(a, b) {
  if (a === b) return true;
  let aValidType = isDate(a);
  let bValidType = isDate(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? a.getTime() === b.getTime() : false;
  }
  aValidType = isSymbol(a);
  bValidType = isSymbol(b);
  if (aValidType || bValidType) {
    return a === b;
  }
  aValidType = isArray$1(a);
  bValidType = isArray$1(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareArrays(a, b) : false;
  }
  aValidType = isObject(a);
  bValidType = isObject(b);
  if (aValidType || bValidType) {
    if (!aValidType || !bValidType) {
      return false;
    }
    aValidType = isMap(a);
    bValidType = isMap(b);
    if (aValidType || bValidType) {
      return aValidType && bValidType ? looseCompareCollections(a, b) : false;
    }
    aValidType = isSet(a);
    bValidType = isSet(b);
    if (aValidType || bValidType) {
      return aValidType && bValidType ? looseCompareCollections(a, b) : false;
    }
    const aKeysCount = Object.keys(a).length;
    const bKeysCount = Object.keys(b).length;
    if (aKeysCount !== bKeysCount) {
      return false;
    }
    for (const key in a) {
      const aHasKey = a.hasOwnProperty(key);
      const bHasKey = b.hasOwnProperty(key);
      if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key])) {
        return false;
      }
    }
  }
  return String(a) === String(b);
}
const isRef$1 = (val) => {
  return !!(val && val["__v_isRef"] === true);
};
const toDisplayString = (val) => {
  return isString(val) ? val : val == null ? "" : isArray$1(val) || isObject(val) && (val.toString === objectToString || !isFunction(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
};
const replacer = (_key, val) => {
  if (isRef$1(val)) {
    return replacer(_key, val.value);
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce(
        (entries, [key, val2], i) => {
          entries[stringifySymbol(key, i) + " =>"] = val2;
          return entries;
        },
        {}
      )
    };
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()].map((v) => stringifySymbol(v))
    };
  } else if (isSymbol(val)) {
    return stringifySymbol(val);
  } else if (isObject(val) && !isArray$1(val) && !isPlainObject(val)) {
    return String(val);
  }
  return val;
};
const stringifySymbol = (v, i = "") => {
  var _a;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    isSymbol(v) ? `Symbol(${(_a = v.description) != null ? _a : i})` : v
  );
};

/**
* @vue/reactivity v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let activeEffectScope;
class EffectScope {
  // TODO isolatedDeclarations "__v_skip"
  constructor(detached = false) {
    this.detached = detached;
    this._active = true;
    this._on = 0;
    this.effects = [];
    this.cleanups = [];
    this._isPaused = false;
    this._warnOnRun = true;
    this.__v_skip = true;
    if (!detached && activeEffectScope) {
      if (activeEffectScope.active) {
        this.parent = activeEffectScope;
        this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this
        ) - 1;
      } else {
        this._active = false;
        this._warnOnRun = false;
      }
    }
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = true;
      let i, l;
      if (this.scopes) {
        const scopes = this.scopes.slice();
        for (i = 0, l = scopes.length; i < l; i++) {
          scopes[i].pause();
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause();
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i, l;
        if (this.scopes) {
          const scopes = this.scopes.slice();
          for (i = 0, l = scopes.length; i < l; i++) {
            scopes[i].resume();
          }
        }
        const effects = this.effects.slice();
        for (i = 0, l = effects.length; i < l; i++) {
          effects[i].resume();
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (activeEffectScope === this) {
        activeEffectScope = this.prevScope;
      } else {
        let current = activeEffectScope;
        while (current) {
          if (current.prevScope === this) {
            current.prevScope = this.prevScope;
            break;
          }
          current = current.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false;
      let i, l;
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop();
      }
      this.effects.length = 0;
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]();
      }
      this.cleanups.length = 0;
      if (this.scopes) {
        const scopes = this.scopes.slice();
        for (i = 0, l = scopes.length; i < l; i++) {
          scopes[i].stop(true);
        }
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop();
        if (last && last !== this) {
          this.parent.scopes[this.index] = last;
          last.index = this.index;
        }
      }
      this.parent = void 0;
    }
  }
}
function getCurrentScope() {
  return activeEffectScope;
}
let activeSub;
const pausedQueueEffects = /* @__PURE__ */ new WeakSet();
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 1 | 4;
    this.next = void 0;
    this.cleanup = void 0;
    this.scheduler = void 0;
    if (activeEffectScope) {
      if (activeEffectScope.active) {
        activeEffectScope.effects.push(this);
      } else {
        this.flags &= -2;
      }
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = void 0;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
}
let batchDepth = 0;
let batchedSub;
let batchedComputed;
function batch(sub, isComputed = false) {
  sub.flags |= 8;
  if (isComputed) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e = batchedComputed;
    batchedComputed = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      e = next;
    }
  }
  let error;
  while (batchedSub) {
    let e = batchedSub;
    batchedSub = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      if (e.flags & 1) {
        try {
          ;
          e.trigger();
        } catch (err) {
          if (!error) error = err;
        }
      }
      e = next;
    }
  }
  if (error) throw error;
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail) tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = void 0;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return;
  }
  computed2.flags &= -17;
  if (computed2.globalVersion === globalVersion) {
    return;
  }
  computed2.globalVersion = globalVersion;
  if (!computed2.isSSR && computed2.flags & 128 && (!computed2.deps && !computed2._dirty || !isDirty(computed2))) {
    return;
  }
  computed2.flags |= 2;
  const dep = computed2.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed2;
  shouldTrack = true;
  try {
    prepareDeps(computed2);
    const value = computed2.fn(computed2._value);
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128;
      computed2._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed2);
    computed2.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = void 0;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = void 0;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = void 0;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = void 0;
  }
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
  const { cleanup } = e;
  e.cleanup = void 0;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = void 0;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
let globalVersion = 0;
class Link {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2;
    this.version = 0;
    this.activeLink = void 0;
    this.subs = void 0;
    this.map = void 0;
    this.key = void 0;
    this.sc = 0;
    this.__v_skip = true;
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = void 0;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (false) ;
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          ;
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
}
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed;
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16;
      for (let l = computed2.deps; l; l = l.nextDep) {
        addSub(l);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail) currentTail.nextSub = link;
    }
    link.dep.subs = link;
  }
}
const targetMap = /* @__PURE__ */ new WeakMap();
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep());
      dep.map = depsMap;
      dep.key = key;
    }
    {
      dep.track();
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      {
        dep.trigger();
      }
    }
  };
  startBatch();
  if (type === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray$1(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function reactiveReadArray(array) {
  const raw = /* @__PURE__ */ toRaw(array);
  if (raw === array) return raw;
  track(raw, "iterate", ARRAY_ITERATE_KEY);
  return /* @__PURE__ */ isShallow(array) ? raw : raw.map(toReactive);
}
function shallowReadArray(arr) {
  track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => isArray$1(x) ? reactiveReadArray(x) : x)
    );
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, void 0, arguments);
  },
  filter(fn, thisArg) {
    return apply(
      this,
      "filter",
      fn,
      thisArg,
      (v) => v.map((item) => toWrapped(this, item)),
      arguments
    );
  },
  find(fn, thisArg) {
    return apply(
      this,
      "find",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, void 0, arguments);
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      "findLast",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, void 0, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, void 0, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, void 0, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self, method, wrapValue) {
  const arr = shallowReadArray(self);
  const iter = arr[method]();
  if (arr !== self && !/* @__PURE__ */ isShallow(self)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}
const arrayProto = Array.prototype;
function apply(self, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self);
  const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
  const methodFn = arr[method];
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self) {
    if (needsWrap) {
      wrappedFn = function(item, index) {
        return fn.call(this, toWrapped(self, item), index, self);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index) {
        return fn.call(this, item, index, self);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self, method, fn, args) {
  const arr = shallowReadArray(self);
  const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function(acc, item, index) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self, acc);
        }
        return fn.call(this, acc, toWrapped(self, item), index, self);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, item, index, self);
      };
    }
  }
  const result = arr[method](wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self, result) : result;
}
function searchProxy(self, method, args) {
  const arr = /* @__PURE__ */ toRaw(self);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method](...args);
  if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
    args[0] = /* @__PURE__ */ toRaw(args[0]);
    return arr[method](...args);
  }
  return res;
}
function noTracking(self, method, args = []) {
  pauseTracking();
  startBatch();
  const res = (/* @__PURE__ */ toRaw(self))[method].apply(self, args);
  endBatch();
  resetTracking();
  return res;
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol)
);
function hasOwnProperty(key) {
  if (!isSymbol(key)) key = String(key);
  const obj = /* @__PURE__ */ toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip") return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray$1(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (/* @__PURE__ */ isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject(value) ? /* @__PURE__ */ readonly(value) : value;
    }
    if (isObject(res)) {
      return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
    }
    return res;
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray$1(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
      if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
        oldValue = /* @__PURE__ */ toRaw(oldValue);
        value = /* @__PURE__ */ toRaw(value);
      }
      if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
        if (isOldValueReadonly) {
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(
      target,
      key,
      value,
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (target === /* @__PURE__ */ toRaw(receiver) && result) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(
      target,
      "iterate",
      isArray$1(target) ? "length" : ITERATE_KEY
    );
    return Reflect.ownKeys(target);
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    return true;
  }
  deleteProperty(target, key) {
    return true;
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(true);
const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = /* @__PURE__ */ toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
    const isKeyOnly = method === "keys" && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(
      rawTarget,
      "iterate",
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
    );
    return extend(
      // inheriting all iterator properties
      Object.create(innerIterator),
      {
        // iterator protocol
        next() {
          const { value, done } = innerIterator.next();
          return done ? { value, done } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        }
      }
    );
  };
}
function createReadonlyMethod(type) {
  return function(...args) {
    return type === "delete" ? false : type === "clear" ? void 0 : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend(
    instrumentations,
    readonly2 ? {
      add: createReadonlyMethod("add"),
      set: createReadonlyMethod("set"),
      delete: createReadonlyMethod("delete"),
      clear: createReadonlyMethod("clear")
    } : {
      add(value) {
        const target = /* @__PURE__ */ toRaw(this);
        const proto = getProto(target);
        const rawValue = /* @__PURE__ */ toRaw(value);
        const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
        const hadKey = proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue);
        if (!hadKey) {
          target.add(valueToAdd);
          trigger(target, "add", valueToAdd, valueToAdd);
        }
        return this;
      },
      set(key, value) {
        if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
          value = /* @__PURE__ */ toRaw(value);
        }
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        const oldValue = get.call(target, key);
        target.set(key, value);
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value);
        }
        return this;
      },
      delete(key) {
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        get ? get.call(target, key) : void 0;
        const result = target.delete(key);
        if (hadKey) {
          trigger(target, "delete", key, void 0);
        }
        return result;
      },
      clear() {
        const target = /* @__PURE__ */ toRaw(this);
        const hadItems = target.size !== 0;
        const result = target.clear();
        if (hadItems) {
          trigger(
            target,
            "clear",
            void 0,
            void 0);
        }
        return result;
      }
    }
  );
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver
    );
  };
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true)
};
const reactiveMap = /* @__PURE__ */ new WeakMap();
const shallowReactiveMap = /* @__PURE__ */ new WeakMap();
const readonlyMap = /* @__PURE__ */ new WeakMap();
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return target;
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  );
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject(target)) {
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  if (target["__v_skip"] || !Object.isExtensible(target)) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const targetType = targetTypeMap(toRawType(target));
  if (targetType === 0) {
    return target;
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers
  );
  proxyMap.set(target, proxy);
  return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
  if (/* @__PURE__ */ isReadonly(value)) {
    return /* @__PURE__ */ isReactive(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
  const raw = observed && observed["__v_raw"];
  return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
  if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) {
    def(value, "__v_skip", true);
  }
  return value;
}
const toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive(value) : value;
const toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
  return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
  return createRef(value, false);
}
// @__NO_SIDE_EFFECTS__
function shallowRef(value) {
  return createRef(value, true);
}
function createRef(rawValue, shallow) {
  if (/* @__PURE__ */ isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue, shallow);
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep();
    this["__v_isRef"] = true;
    this["__v_isShallow"] = false;
    this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
    this._value = isShallow2 ? value : toReactive(value);
    this["__v_isShallow"] = isShallow2;
  }
  get value() {
    {
      this.dep.track();
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
    newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue;
      this._value = useDirectValue ? newValue : toReactive(newValue);
      {
        this.dep.trigger();
      }
    }
  }
}
function unref(ref2) {
  return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  }
};
function proxyRefs(objectWithRefs) {
  return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn;
    this.setter = setter;
    this._value = void 0;
    this.dep = new Dep(this);
    this.__v_isRef = true;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 16;
    this.globalVersion = globalVersion - 1;
    this.next = void 0;
    this.effect = this;
    this["__v_isReadonly"] = !setter;
    this.isSSR = isSSR;
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16;
    if (!(this.flags & 8) && // avoid infinite self recursion
    activeSub !== this) {
      batch(this, true);
      return true;
    }
  }
  get value() {
    const link = this.dep.track();
    refreshComputed(this);
    if (link) {
      link.version = this.dep.version;
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    }
  }
}
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter;
  let setter;
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions;
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR);
  return cRef;
}
const INITIAL_WATCHER_VALUE = {};
const cleanupMap = /* @__PURE__ */ new WeakMap();
let activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
  if (owner) {
    let cleanups = cleanupMap.get(owner);
    if (!cleanups) cleanupMap.set(owner, cleanups = []);
    cleanups.push(cleanupFn);
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call } = options;
  const reactiveGetter = (source2) => {
    if (deep) return source2;
    if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1);
    return traverse(source2);
  };
  let effect2;
  let getter;
  let cleanup;
  let boundCleanup;
  let forceTrigger = false;
  let isMultiSource = false;
  if (/* @__PURE__ */ isRef(source)) {
    getter = () => source.value;
    forceTrigger = /* @__PURE__ */ isShallow(source);
  } else if (/* @__PURE__ */ isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (isArray$1(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
    getter = () => source.map((s) => {
      if (/* @__PURE__ */ isRef(s)) {
        return s.value;
      } else if (/* @__PURE__ */ isReactive(s)) {
        return reactiveGetter(s);
      } else if (isFunction(s)) {
        return call ? call(s, 2) : s();
      } else ;
    });
  } else if (isFunction(source)) {
    if (cb) {
      getter = call ? () => call(source, 2) : source;
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking();
          try {
            cleanup();
          } finally {
            resetTracking();
          }
        }
        const currentEffect = activeWatcher;
        activeWatcher = effect2;
        try {
          return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
        } finally {
          activeWatcher = currentEffect;
        }
      };
    }
  } else {
    getter = NOOP;
  }
  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  const scope = getCurrentScope();
  const watchHandle = () => {
    effect2.stop();
    if (scope && scope.active) {
      remove(scope.effects, effect2);
    }
  };
  if (once && cb) {
    const _cb = cb;
    cb = (...args) => {
      const res = _cb(...args);
      watchHandle();
      return res;
    };
  }
  let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
  const job = (immediateFirstRun) => {
    if (!(effect2.flags & 1) || !effect2.dirty && !immediateFirstRun) {
      return;
    }
    if (cb) {
      const newValue = effect2.run();
      if (immediateFirstRun || deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
        if (cleanup) {
          cleanup();
        }
        const currentWatcher = activeWatcher;
        activeWatcher = effect2;
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
            boundCleanup
          ];
          oldValue = newValue;
          call ? call(cb, 3, args) : (
            // @ts-expect-error
            cb(...args)
          );
        } finally {
          activeWatcher = currentWatcher;
        }
      }
    } else {
      effect2.run();
    }
  };
  if (augmentJob) {
    augmentJob(job);
  }
  effect2 = new ReactiveEffect(getter);
  effect2.scheduler = scheduler ? () => scheduler(job, false) : job;
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect2);
  cleanup = effect2.onStop = () => {
    const cleanups = cleanupMap.get(effect2);
    if (cleanups) {
      if (call) {
        call(cleanups, 4);
      } else {
        for (const cleanup2 of cleanups) cleanup2();
      }
      cleanupMap.delete(effect2);
    }
  };
  if (cb) {
    if (immediate) {
      job(true);
    } else {
      oldValue = effect2.run();
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true);
  } else {
    effect2.run();
  }
  watchHandle.pause = effect2.pause.bind(effect2);
  watchHandle.resume = effect2.resume.bind(effect2);
  watchHandle.stop = watchHandle;
  return watchHandle;
}
function traverse(value, depth = Infinity, seen) {
  if (depth <= 0 || !isObject(value) || value["__v_skip"]) {
    return value;
  }
  seen = seen || /* @__PURE__ */ new Map();
  if ((seen.get(value) || 0) >= depth) {
    return value;
  }
  seen.set(value, depth);
  depth--;
  if (/* @__PURE__ */ isRef(value)) {
    traverse(value.value, depth, seen);
  } else if (isArray$1(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen);
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v) => {
      traverse(v, depth, seen);
    });
  } else if (isPlainObject(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen);
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen);
      }
    }
  }
  return value;
}

/**
* @vue/runtime-core v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const stack = [];
let isWarning = false;
function warn$1(msg, ...args) {
  if (isWarning) return;
  isWarning = true;
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();
  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map((a) => {
          var _a, _b;
          return (_b = (_a = a.toString) == null ? void 0 : _a.call(a)) != null ? _b : JSON.stringify(a);
        }).join(""),
        instance && instance.proxy,
        trace.map(
          ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`
        ).join("\n"),
        trace
      ]
    );
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];
    if (trace.length && // avoid spamming console during tests
    true) {
      warnArgs.push(`
`, ...formatTrace(trace));
    }
    console.warn(...warnArgs);
  }
  resetTracking();
  isWarning = false;
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];
  if (!currentVNode) {
    return [];
  }
  const normalizedStack = [];
  while (currentVNode) {
    const last = normalizedStack[0];
    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }
    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }
  return normalizedStack;
}
function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i) => {
    logs.push(...i === 0 ? [] : [`
`], ...formatTraceEntry(entry));
  });
  return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot
  )}`;
  const close = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
}
function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]));
  });
  if (keys.length > 3) {
    res.push(` ...`);
  }
  return res;
}
function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (isRef(value)) {
    value = formatProp(key, toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}
function callWithErrorHandling(fn, instance, type, args) {
  try {
    return args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type);
  }
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args);
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type);
      });
    }
    return res;
  }
  if (isArray$1(fn)) {
    const values = [];
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
    }
    return values;
  }
}
function handleError(err, instance, type, throwInDev = true) {
  const contextVNode = instance ? instance.vnode : null;
  const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
  if (instance) {
    let cur = instance.parent;
    const exposedInstance = instance.proxy;
    const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
    while (cur) {
      const errorCapturedHooks = cur.ec;
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
            return;
          }
        }
      }
      cur = cur.parent;
    }
    if (errorHandler) {
      pauseTracking();
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo
      ]);
      resetTracking();
      return;
    }
  }
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
  if (throwInProd) {
    throw err;
  } else {
    console.error(err);
  }
}
const queue = [];
let flushIndex = -1;
const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;
const resolvedPromise = /* @__PURE__ */ Promise.resolve();
let currentFlushPromise = null;
function nextTick(fn) {
  const p = currentFlushPromise || resolvedPromise;
  return fn ? p.then(this ? fn.bind(this) : fn) : p;
}
function findInsertionIndex$1(id) {
  let start = flushIndex + 1;
  let end = queue.length;
  while (start < end) {
    const middle = start + end >>> 1;
    const middleJob = queue[middle];
    const middleJobId = getId(middleJob);
    if (middleJobId < id || middleJobId === id && middleJob.flags & 2) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start;
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job);
    const lastJob = queue[queue.length - 1];
    if (!lastJob || // fast path when the job id is larger than the tail
    !(job.flags & 2) && jobId >= getId(lastJob)) {
      queue.push(job);
    } else {
      queue.splice(findInsertionIndex$1(jobId), 0, job);
    }
    job.flags |= 1;
    queueFlush();
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
function queuePostFlushCb(cb) {
  if (!isArray$1(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb);
      cb.flags |= 1;
    }
  } else {
    for (let i = 0; i < cb.length; i++) {
      pendingPostFlushCbs.push(cb[i]);
    }
  }
  queueFlush();
}
function flushPreFlushCbs(instance, seen, i = flushIndex + 1) {
  for (; i < queue.length; i++) {
    const cb = queue[i];
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid) {
        continue;
      }
      queue.splice(i, 1);
      i--;
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      cb();
      if (!(cb.flags & 4)) {
        cb.flags &= -2;
      }
    }
  }
}
function flushPostFlushCbs(seen) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b)
    );
    pendingPostFlushCbs.length = 0;
    if (activePostFlushCbs) {
      for (let i = 0; i < deduped.length; i++) {
        activePostFlushCbs.push(deduped[i]);
      }
      return;
    }
    activePostFlushCbs = deduped;
    for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
      const cb = activePostFlushCbs[postFlushIndex];
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      if (!(cb.flags & 8)) cb();
      cb.flags &= -2;
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
const getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen) {
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && !(job.flags & 8)) {
        if (false) ;
        if (job.flags & 4) {
          job.flags &= ~1;
        }
        callWithErrorHandling(
          job,
          job.i,
          job.i ? 15 : 14
        );
        if (!(job.flags & 4)) {
          job.flags &= ~1;
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job) {
        job.flags &= -2;
      }
    }
    flushIndex = -1;
    queue.length = 0;
    flushPostFlushCbs();
    currentFlushPromise = null;
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs();
    }
  }
}
let currentRenderingInstance = null;
let currentScopeId = null;
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance;
  currentRenderingInstance = instance;
  currentScopeId = instance && instance.type.__scopeId || null;
  return prev;
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn;
  if (fn._n) {
    return fn;
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1);
    }
    const prevInstance = setCurrentRenderingInstance(ctx);
    const prevStackSize = blockStack.length;
    let res;
    try {
      res = fn(...args);
    } finally {
      for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
      setCurrentRenderingInstance(prevInstance);
      if (renderFnWithContext._d) {
        setBlockTracking(1);
      }
    }
    return res;
  };
  renderFnWithContext._n = true;
  renderFnWithContext._c = true;
  renderFnWithContext._d = true;
  return renderFnWithContext;
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value;
    }
    let hook = binding.dir[name];
    if (hook) {
      pauseTracking();
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        vnode,
        prevVNode
      ]);
      resetTracking();
    }
  }
}
function provide(key, value) {
  if (currentInstance) {
    let provides = currentInstance.provides;
    const parentProvides = currentInstance.parent && currentInstance.parent.provides;
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    }
    provides[key] = value;
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance();
  if (instance || currentApp) {
    let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
    if (provides && key in provides) {
      return provides[key];
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
    } else ;
  }
}
const ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);
    return ctx;
  }
};
function watch(source, cb, options) {
  return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options;
  const baseWatchOptions = extend({}, options);
  const runsImmediately = cb && immediate || !cb && flush !== "post";
  let ssrCleanup;
  if (isInSSRComponentSetup) {
    if (flush === "sync") {
      const ctx = useSSRContext();
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
    } else if (!runsImmediately) {
      const watchStopHandle = () => {
      };
      watchStopHandle.stop = NOOP;
      watchStopHandle.resume = NOOP;
      watchStopHandle.pause = NOOP;
      return watchStopHandle;
    }
  }
  const instance = currentInstance;
  baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
  let isPre = false;
  if (flush === "post") {
    baseWatchOptions.scheduler = (job) => {
      queuePostRenderEffect(job, instance && instance.suspense);
    };
  } else if (flush !== "sync") {
    isPre = true;
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job();
      } else {
        queueJob(job);
      }
    };
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4;
    }
    if (isPre) {
      job.flags |= 2;
      if (instance) {
        job.id = instance.uid;
        job.i = instance;
      }
    }
  };
  const watchHandle = watch$1(source, cb, baseWatchOptions);
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle);
    } else if (runsImmediately) {
      watchHandle();
    }
  }
  return watchHandle;
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy;
  const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
  let cb;
  if (isFunction(value)) {
    cb = value;
  } else {
    cb = value.handler;
    options = value;
  }
  const reset = setCurrentInstance(this);
  const res = doWatch(getter, cb.bind(publicThis), options);
  reset();
  return res;
}
function createPathGetter(ctx, path) {
  const segments = path.split(".");
  return () => {
    let cur = ctx;
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]];
    }
    return cur;
  };
}
const pendingMounts = /* @__PURE__ */ new WeakMap();
const TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
const isTeleport = (type) => type.__isTeleport;
const isTeleportDisabled = (props) => props && (props.disabled || props.disabled === "");
const isTeleportDeferred = (props) => props && (props.defer || props.defer === "");
const isTargetSVG = (target) => typeof SVGElement !== "undefined" && target instanceof SVGElement;
const isTargetMathML = (target) => typeof MathMLElement === "function" && target instanceof MathMLElement;
const resolveTarget = (props, select) => {
  const targetSelector = props && props.to;
  if (isString(targetSelector)) {
    if (!select) {
      return null;
    } else {
      const target = select(targetSelector);
      return target;
    }
  } else {
    return targetSelector;
  }
};
const TeleportImpl = {
  name: "Teleport",
  __isTeleport: true,
  process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals) {
    const {
      mc: mountChildren,
      pc: patchChildren,
      pbc: patchBlockChildren,
      o: { insert, querySelector, createText, createComment, parentNode }
    } = internals;
    const disabled = isTeleportDisabled(n2.props);
    let { dynamicChildren } = n2;
    const mount = (vnode, container2, anchor2) => {
      if (vnode.shapeFlag & 16) {
        mountChildren(
          vnode.children,
          container2,
          anchor2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    };
    const mountToTarget = (vnode = n2) => {
      const disabled2 = isTeleportDisabled(vnode.props);
      const target = vnode.target = resolveTarget(vnode.props, querySelector);
      const targetAnchor = prepareAnchor(target, vnode, createText, insert);
      if (target) {
        if (namespace !== "svg" && isTargetSVG(target)) {
          namespace = "svg";
        } else if (namespace !== "mathml" && isTargetMathML(target)) {
          namespace = "mathml";
        }
        if (parentComponent && parentComponent.isCE) {
          (parentComponent.ce._teleportTargets || (parentComponent.ce._teleportTargets = /* @__PURE__ */ new Set())).add(target);
        }
        if (!disabled2) {
          mount(vnode, target, targetAnchor);
          updateCssVars(vnode, false);
        }
      }
    };
    const queuePendingMount = (vnode) => {
      const mountJob = () => {
        if (pendingMounts.get(vnode) !== mountJob) return;
        pendingMounts.delete(vnode);
        if (isTeleportDisabled(vnode.props)) {
          const mountContainer = parentNode(vnode.el) || container;
          mount(vnode, mountContainer, vnode.anchor);
          updateCssVars(vnode, true);
        }
        mountToTarget(vnode);
      };
      pendingMounts.set(vnode, mountJob);
      queuePostRenderEffect(mountJob, parentSuspense);
    };
    if (n1 == null) {
      const placeholder = n2.el = createText("");
      const mainAnchor = n2.anchor = createText("");
      insert(placeholder, container, anchor);
      insert(mainAnchor, container, anchor);
      if (isTeleportDeferred(n2.props) || parentSuspense && parentSuspense.pendingBranch) {
        queuePendingMount(n2);
        return;
      }
      if (disabled) {
        mount(n2, container, mainAnchor);
        updateCssVars(n2, true);
      }
      mountToTarget();
    } else {
      n2.el = n1.el;
      const mainAnchor = n2.anchor = n1.anchor;
      const pendingMount = pendingMounts.get(n1);
      if (pendingMount) {
        pendingMount.flags |= 8;
        pendingMounts.delete(n1);
        queuePendingMount(n2);
        return;
      }
      n2.targetStart = n1.targetStart;
      const target = n2.target = n1.target;
      const targetAnchor = n2.targetAnchor = n1.targetAnchor;
      const wasDisabled = isTeleportDisabled(n1.props);
      const currentContainer = wasDisabled ? container : target;
      const currentAnchor = wasDisabled ? mainAnchor : targetAnchor;
      if (namespace === "svg" || isTargetSVG(target)) {
        namespace = "svg";
      } else if (namespace === "mathml" || isTargetMathML(target)) {
        namespace = "mathml";
      }
      if (dynamicChildren) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          currentContainer,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        traverseStaticChildren(n1, n2, true);
      } else if (!optimized) {
        patchChildren(
          n1,
          n2,
          currentContainer,
          currentAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          false
        );
      }
      if (disabled) {
        if (!wasDisabled) {
          moveTeleport(
            n2,
            container,
            mainAnchor,
            internals,
            1
          );
        } else {
          if (n2.props && n1.props && n2.props.to !== n1.props.to) {
            n2.props.to = n1.props.to;
          }
        }
      } else {
        if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
          const nextTarget = resolveTarget(n2.props, querySelector);
          if (nextTarget) {
            n2.target = nextTarget;
            moveTeleport(
              n2,
              nextTarget,
              null,
              internals,
              0
            );
          }
        } else if (wasDisabled) {
          moveTeleport(
            n2,
            target,
            targetAnchor,
            internals,
            1
          );
        }
      }
      updateCssVars(n2, disabled);
    }
  },
  remove(vnode, parentComponent, parentSuspense, { um: unmount, o: { remove: hostRemove } }, doRemove) {
    const {
      shapeFlag,
      children,
      anchor,
      targetStart,
      targetAnchor,
      target,
      props
    } = vnode;
    const disabled = isTeleportDisabled(props);
    const shouldRemove = doRemove || !disabled;
    const pendingMount = pendingMounts.get(vnode);
    if (pendingMount) {
      pendingMount.flags |= 8;
      pendingMounts.delete(vnode);
    }
    if (target) {
      hostRemove(targetStart);
      hostRemove(targetAnchor);
    }
    doRemove && hostRemove(anchor);
    if (!pendingMount && (disabled || target) && shapeFlag & 16) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        unmount(
          child,
          parentComponent,
          parentSuspense,
          shouldRemove,
          !!child.dynamicChildren
        );
      }
    }
  },
  move: moveTeleport,
  hydrate: hydrateTeleport
};
function moveTeleport(vnode, container, parentAnchor, { o: { insert }, m: move }, moveType = 2) {
  if (moveType === 0) {
    insert(vnode.targetAnchor, container, parentAnchor);
  }
  const { el, anchor, shapeFlag, children, props } = vnode;
  const isReorder = moveType === 2;
  if (isReorder) {
    insert(el, container, parentAnchor);
  }
  if (!pendingMounts.has(vnode) && (!isReorder || isTeleportDisabled(props))) {
    if (shapeFlag & 16) {
      for (let i = 0; i < children.length; i++) {
        move(
          children[i],
          container,
          parentAnchor,
          2
        );
      }
    }
  }
  if (isReorder) {
    insert(anchor, container, parentAnchor);
  }
}
function hydrateTeleport(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized, {
  o: { nextSibling, parentNode, querySelector, insert, createText }
}, hydrateChildren) {
  function hydrateAnchor(target2, targetNode) {
    let targetAnchor = targetNode;
    while (targetAnchor) {
      if (targetAnchor && targetAnchor.nodeType === 8) {
        if (targetAnchor.data === "teleport start anchor") {
          vnode.targetStart = targetAnchor;
        } else if (targetAnchor.data === "teleport anchor") {
          vnode.targetAnchor = targetAnchor;
          target2._lpa = vnode.targetAnchor && nextSibling(vnode.targetAnchor);
          break;
        }
      }
      targetAnchor = nextSibling(targetAnchor);
    }
  }
  function hydrateDisabledTeleport(node2, vnode2) {
    vnode2.anchor = hydrateChildren(
      nextSibling(node2),
      vnode2,
      parentNode(node2),
      parentComponent,
      parentSuspense,
      slotScopeIds,
      optimized
    );
  }
  const target = vnode.target = resolveTarget(
    vnode.props,
    querySelector
  );
  const disabled = isTeleportDisabled(vnode.props);
  if (target) {
    const targetNode = target._lpa || target.firstChild;
    if (vnode.shapeFlag & 16) {
      if (disabled) {
        hydrateDisabledTeleport(node, vnode);
        hydrateAnchor(target, targetNode);
        if (!vnode.targetAnchor) {
          prepareAnchor(
            target,
            vnode,
            createText,
            insert,
            // if target is the same as the main view, insert anchors before current node
            // to avoid hydrating mismatch
            parentNode(node) === target ? node : null
          );
        }
      } else {
        vnode.anchor = nextSibling(node);
        hydrateAnchor(target, targetNode);
        if (!vnode.targetAnchor) {
          prepareAnchor(target, vnode, createText, insert);
        }
        hydrateChildren(
          targetNode && nextSibling(targetNode),
          vnode,
          target,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized
        );
      }
    }
    updateCssVars(vnode, disabled);
  } else if (disabled) {
    if (vnode.shapeFlag & 16) {
      hydrateDisabledTeleport(node, vnode);
      vnode.targetStart = node;
      vnode.targetAnchor = nextSibling(node);
    }
  }
  return vnode.anchor && nextSibling(vnode.anchor);
}
const Teleport = TeleportImpl;
function updateCssVars(vnode, isDisabled) {
  const ctx = vnode.ctx;
  if (ctx && ctx.ut) {
    let node, anchor;
    if (isDisabled) {
      node = vnode.el;
      anchor = vnode.anchor;
    } else {
      node = vnode.targetStart;
      anchor = vnode.targetAnchor;
    }
    while (node && node !== anchor) {
      if (node.nodeType === 1) node.setAttribute("data-v-owner", ctx.uid);
      node = node.nextSibling;
    }
    ctx.ut();
  }
}
function prepareAnchor(target, vnode, createText, insert, anchor = null) {
  const targetStart = vnode.targetStart = createText("");
  const targetAnchor = vnode.targetAnchor = createText("");
  targetStart[TeleportEndKey] = targetAnchor;
  if (target) {
    insert(targetStart, target, anchor);
    insert(targetAnchor, target, anchor);
  }
  return targetAnchor;
}
const leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
const enterCbKey$1 = /* @__PURE__ */ Symbol("_enterCb");
function useTransitionState() {
  const state = {
    isMounted: false,
    isLeaving: false,
    isUnmounting: false,
    leavingVNodes: /* @__PURE__ */ new Map()
  };
  onMounted(() => {
    state.isMounted = true;
  });
  onBeforeUnmount(() => {
    state.isUnmounting = true;
  });
  return state;
}
const TransitionHookValidator = [Function, Array];
const BaseTransitionPropsValidators = {
  mode: String,
  appear: Boolean,
  persisted: Boolean,
  // enter
  onBeforeEnter: TransitionHookValidator,
  onEnter: TransitionHookValidator,
  onAfterEnter: TransitionHookValidator,
  onEnterCancelled: TransitionHookValidator,
  // leave
  onBeforeLeave: TransitionHookValidator,
  onLeave: TransitionHookValidator,
  onAfterLeave: TransitionHookValidator,
  onLeaveCancelled: TransitionHookValidator,
  // appear
  onBeforeAppear: TransitionHookValidator,
  onAppear: TransitionHookValidator,
  onAfterAppear: TransitionHookValidator,
  onAppearCancelled: TransitionHookValidator
};
const recursiveGetSubtree = (instance) => {
  const subTree = instance.subTree;
  return subTree.component ? recursiveGetSubtree(subTree.component) : subTree;
};
const BaseTransitionImpl = {
  name: `BaseTransition`,
  props: BaseTransitionPropsValidators,
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    return () => {
      const children = slots.default && getTransitionRawChildren(slots.default(), true);
      const child = children && children.length ? findNonCommentChild(children) : (
        // Keep explicit default-slot conditionals on the same transition path
        // as regular v-if branches, which render a comment placeholder.
        instance.subTree ? createCommentVNode() : void 0
      );
      if (!child) {
        return;
      }
      const rawProps = toRaw(props);
      const { mode } = rawProps;
      if (state.isLeaving) {
        return emptyPlaceholder(child);
      }
      const innerChild = getInnerChild$1(child);
      if (!innerChild) {
        return emptyPlaceholder(child);
      }
      let enterHooks = resolveTransitionHooks(
        innerChild,
        rawProps,
        state,
        instance,
        // #11061, ensure enterHooks is fresh after clone
        (hooks) => enterHooks = hooks
      );
      if (innerChild.type !== Comment) {
        setTransitionHooks(innerChild, enterHooks);
      }
      let oldInnerChild = instance.subTree && getInnerChild$1(instance.subTree);
      if (oldInnerChild && oldInnerChild.type !== Comment && !isSameVNodeType(oldInnerChild, innerChild) && recursiveGetSubtree(instance).type !== Comment) {
        let leavingHooks = resolveTransitionHooks(
          oldInnerChild,
          rawProps,
          state,
          instance
        );
        setTransitionHooks(oldInnerChild, leavingHooks);
        if (mode === "out-in" && innerChild.type !== Comment) {
          state.isLeaving = true;
          leavingHooks.afterLeave = () => {
            state.isLeaving = false;
            if (!(instance.job.flags & 8)) {
              instance.update();
            }
            delete leavingHooks.afterLeave;
            oldInnerChild = void 0;
          };
          return emptyPlaceholder(child);
        } else if (mode === "in-out" && innerChild.type !== Comment) {
          leavingHooks.delayLeave = (el, earlyRemove, delayedLeave) => {
            const leavingVNodesCache = getLeavingNodesForType(
              state,
              oldInnerChild
            );
            leavingVNodesCache[String(oldInnerChild.key)] = oldInnerChild;
            el[leaveCbKey] = () => {
              earlyRemove();
              el[leaveCbKey] = void 0;
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
            enterHooks.delayedLeave = () => {
              delayedLeave();
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
          };
        } else {
          oldInnerChild = void 0;
        }
      } else if (oldInnerChild) {
        oldInnerChild = void 0;
      }
      return child;
    };
  }
};
function findNonCommentChild(children) {
  let child = children[0];
  if (children.length > 1) {
    for (const c of children) {
      if (c.type !== Comment) {
        child = c;
        break;
      }
    }
  }
  return child;
}
const BaseTransition = BaseTransitionImpl;
function getLeavingNodesForType(state, vnode) {
  const { leavingVNodes } = state;
  let leavingVNodesCache = leavingVNodes.get(vnode.type);
  if (!leavingVNodesCache) {
    leavingVNodesCache = /* @__PURE__ */ Object.create(null);
    leavingVNodes.set(vnode.type, leavingVNodesCache);
  }
  return leavingVNodesCache;
}
function resolveTransitionHooks(vnode, props, state, instance, postClone) {
  const {
    appear,
    mode,
    persisted = false,
    onBeforeEnter,
    onEnter,
    onAfterEnter,
    onEnterCancelled,
    onBeforeLeave,
    onLeave,
    onAfterLeave,
    onLeaveCancelled,
    onBeforeAppear,
    onAppear,
    onAfterAppear,
    onAppearCancelled
  } = props;
  const key = String(vnode.key);
  const leavingVNodesCache = getLeavingNodesForType(state, vnode);
  const callHook2 = (hook, args) => {
    hook && callWithAsyncErrorHandling(
      hook,
      instance,
      9,
      args
    );
  };
  const callAsyncHook = (hook, args) => {
    const done = args[1];
    callHook2(hook, args);
    if (isArray$1(hook)) {
      if (hook.every((hook2) => hook2.length <= 1)) done();
    } else if (hook.length <= 1) {
      done();
    }
  };
  const hooks = {
    mode,
    persisted,
    beforeEnter(el) {
      let hook = onBeforeEnter;
      if (!state.isMounted) {
        if (appear) {
          hook = onBeforeAppear || onBeforeEnter;
        } else {
          return;
        }
      }
      if (el[leaveCbKey]) {
        el[leaveCbKey](
          true
          /* cancelled */
        );
      }
      const leavingVNode = leavingVNodesCache[key];
      if (leavingVNode && isSameVNodeType(vnode, leavingVNode) && leavingVNode.el[leaveCbKey]) {
        leavingVNode.el[leaveCbKey]();
      }
      callHook2(hook, [el]);
    },
    enter(el) {
      if (leavingVNodesCache[key] === vnode) return;
      let hook = onEnter;
      let afterHook = onAfterEnter;
      let cancelHook = onEnterCancelled;
      if (!state.isMounted) {
        if (appear) {
          hook = onAppear || onEnter;
          afterHook = onAfterAppear || onAfterEnter;
          cancelHook = onAppearCancelled || onEnterCancelled;
        } else {
          return;
        }
      }
      let called = false;
      el[enterCbKey$1] = (cancelled) => {
        if (called) return;
        called = true;
        if (cancelled) {
          callHook2(cancelHook, [el]);
        } else {
          callHook2(afterHook, [el]);
        }
        if (hooks.delayedLeave) {
          hooks.delayedLeave();
        }
        el[enterCbKey$1] = void 0;
      };
      const done = el[enterCbKey$1].bind(null, false);
      if (hook) {
        callAsyncHook(hook, [el, done]);
      } else {
        done();
      }
    },
    leave(el, remove2) {
      const key2 = String(vnode.key);
      if (el[enterCbKey$1]) {
        el[enterCbKey$1](
          true
          /* cancelled */
        );
      }
      if (state.isUnmounting) {
        return remove2();
      }
      callHook2(onBeforeLeave, [el]);
      let called = false;
      el[leaveCbKey] = (cancelled) => {
        if (called) return;
        called = true;
        remove2();
        if (cancelled) {
          callHook2(onLeaveCancelled, [el]);
        } else {
          callHook2(onAfterLeave, [el]);
        }
        el[leaveCbKey] = void 0;
        if (leavingVNodesCache[key2] === vnode) {
          delete leavingVNodesCache[key2];
        }
      };
      const done = el[leaveCbKey].bind(null, false);
      leavingVNodesCache[key2] = vnode;
      if (onLeave) {
        callAsyncHook(onLeave, [el, done]);
      } else {
        done();
      }
    },
    clone(vnode2) {
      const hooks2 = resolveTransitionHooks(
        vnode2,
        props,
        state,
        instance,
        postClone
      );
      if (postClone) postClone(hooks2);
      return hooks2;
    }
  };
  return hooks;
}
function emptyPlaceholder(vnode) {
  if (isKeepAlive(vnode)) {
    vnode = cloneVNode(vnode);
    vnode.children = null;
    return vnode;
  }
}
function getInnerChild$1(vnode) {
  if (!isKeepAlive(vnode)) {
    if (isTeleport(vnode.type) && vnode.children) {
      return findNonCommentChild(vnode.children);
    }
    return vnode;
  }
  if (vnode.component) {
    return vnode.component.subTree;
  }
  const { shapeFlag, children } = vnode;
  if (children) {
    if (shapeFlag & 16) {
      return children[0];
    }
    if (shapeFlag & 32 && isFunction(children.default)) {
      return children.default();
    }
  }
}
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks;
    const subTree = vnode.component.subTree;
    setTransitionHooks(
      isTeleport(subTree.type) ? getInnerChild$1(subTree) || subTree : subTree,
      hooks
    );
  } else if (vnode.shapeFlag & 128) {
    vnode.ssContent.transition = hooks.clone(vnode.ssContent);
    vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
  } else {
    vnode.transition = hooks;
  }
}
function getTransitionRawChildren(children, keepComment = false, parentKey) {
  let ret = [];
  let keyedFragmentCount = 0;
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    const key = parentKey == null ? child.key : String(parentKey) + String(child.key != null ? child.key : i);
    if (child.type === Fragment) {
      if (child.patchFlag & 128) keyedFragmentCount++;
      ret = ret.concat(
        getTransitionRawChildren(child.children, keepComment, key)
      );
    } else if (keepComment || child.type !== Comment) {
      ret.push(key != null ? cloneVNode(child, { key }) : child);
    }
  }
  if (keyedFragmentCount > 1) {
    for (let i = 0; i < ret.length; i++) {
      ret[i].patchFlag = -2;
    }
  }
  return ret;
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction(options) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    /* @__PURE__ */ (() => extend({ name: options.name }, extraOptions, { setup: options }))()
  ) : options;
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + "-", 0, 0];
}
function isTemplateRefKey(refs, key) {
  let desc;
  return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
}
const pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray$1(rawRef)) {
    rawRef.forEach(
      (r, i) => setRef(
        r,
        oldRawRef && (isArray$1(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount
      )
    );
    return;
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
    }
    return;
  }
  const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
  const value = isUnmount ? null : refValue;
  const { i: owner, r: ref3 } = rawRef;
  const oldRef = oldRawRef && oldRawRef.r;
  const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
  const setupState = owner.setupState;
  const rawSetupState = toRaw(setupState);
  const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
    if (isTemplateRefKey(refs, key)) {
      return false;
    }
    return hasOwn(rawSetupState, key);
  };
  const canSetRef = (ref22, key) => {
    if (key && isTemplateRefKey(refs, key)) {
      return false;
    }
    return true;
  };
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef);
    if (isString(oldRef)) {
      refs[oldRef] = null;
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null;
      }
    } else if (isRef(oldRef)) {
      const oldRawRefAtom = oldRawRef;
      if (canSetRef(oldRef, oldRawRefAtom.k)) {
        oldRef.value = null;
      }
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
    }
  }
  if (isFunction(ref3)) {
    callWithErrorHandling(ref3, owner, 12, [value, refs]);
  } else {
    const _isString = isString(ref3);
    const _isRef = isRef(ref3);
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString ? canSetSetupRef(ref3) ? setupState[ref3] : refs[ref3] : canSetRef() || !rawRef.k ? ref3.value : refs[rawRef.k];
          if (isUnmount) {
            isArray$1(existing) && remove(existing, refValue);
          } else {
            if (!isArray$1(existing)) {
              if (_isString) {
                refs[ref3] = [refValue];
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3];
                }
              } else {
                const newVal = [refValue];
                if (canSetRef(ref3, rawRef.k)) {
                  ref3.value = newVal;
                }
                if (rawRef.k) refs[rawRef.k] = newVal;
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue);
            }
          }
        } else if (_isString) {
          refs[ref3] = value;
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value;
          }
        } else if (_isRef) {
          if (canSetRef(ref3, rawRef.k)) {
            ref3.value = value;
          }
          if (rawRef.k) refs[rawRef.k] = value;
        } else ;
      };
      if (value) {
        const job = () => {
          doSet();
          pendingSetRefMap.delete(rawRef);
        };
        job.id = -1;
        pendingSetRefMap.set(rawRef, job);
        queuePostRenderEffect(job, parentSuspense);
      } else {
        invalidatePendingSetRef(rawRef);
        doSet();
      }
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef);
  if (pendingSetRef) {
    pendingSetRef.flags |= 8;
    pendingSetRefMap.delete(rawRef);
  }
}
getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1));
getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id));
const isAsyncWrapper = (i) => !!i.type.__asyncLoader;
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    let current = target;
    while (current) {
      if (current.isDeactivated) {
        return;
      }
      current = current.parent;
    }
    return hook();
  });
  injectHook(type, wrappedHook, target);
  if (target) {
    let current = target.parent;
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current);
      }
      current = current.parent;
    }
  }
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  const injected = injectHook(
    type,
    hook,
    keepAliveRoot,
    true
    /* prepend */
  );
  onUnmounted(() => {
    remove(keepAliveRoot[type], injected);
  }, target);
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = []);
    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      pauseTracking();
      const reset = setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type, args);
      reset();
      resetTracking();
      return res;
    });
    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
    return wrappedHook;
  }
}
const createHook = (lifecycle) => (hook, target = currentInstance) => {
  if (!isInSSRComponentSetup || lifecycle === "sp") {
    injectHook(lifecycle, (...args) => hook(...args), target);
  }
};
const onBeforeMount = createHook("bm");
const onMounted = createHook("m");
const onBeforeUpdate = createHook(
  "bu"
);
const onUpdated = createHook("u");
const onBeforeUnmount = createHook(
  "bum"
);
const onUnmounted = createHook("um");
const onServerPrefetch = createHook(
  "sp"
);
const onRenderTriggered = createHook("rtg");
const onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
  injectHook("ec", hook, target);
}
const COMPONENTS = "components";
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
function resolveDynamicComponent(component) {
  if (isString(component)) {
    return resolveAsset(COMPONENTS, component, false) || component;
  } else {
    return component || NULL_DYNAMIC_COMPONENT;
  }
}
function resolveAsset(type, name, warnMissing = true, maybeSelfReference = false) {
  const instance = currentRenderingInstance || currentInstance;
  if (instance) {
    const Component = instance.type;
    {
      const selfName = getComponentName(
        Component,
        false
      );
      if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) {
        return Component;
      }
    }
    const res = (
      // local registration
      // check instance[type] first which is resolved for options API
      resolve(instance[type] || Component[type], name) || // global registration
      resolve(instance.appContext[type], name)
    );
    if (!res && maybeSelfReference) {
      return Component;
    }
    return res;
  }
}
function resolve(registry, name) {
  return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
}
function renderList(source, renderItem, cache, index) {
  let ret;
  const cached = cache;
  const sourceIsArray = isArray$1(source);
  if (sourceIsArray || isString(source)) {
    const sourceIsReactiveArray = sourceIsArray && isReactive(source);
    let needsWrap = false;
    let isReadonlySource = false;
    if (sourceIsReactiveArray) {
      needsWrap = !isShallow(source);
      isReadonlySource = isReadonly(source);
      source = shallowReadArray(source);
    }
    ret = new Array(source.length);
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(
        needsWrap ? isReadonlySource ? toReadonly(toReactive(source[i])) : toReactive(source[i]) : source[i],
        i,
        void 0,
        cached
      );
    }
  } else if (typeof source === "number") {
    {
      ret = new Array(source);
      for (let i = 0; i < source; i++) {
        ret[i] = renderItem(i + 1, i, void 0, cached);
      }
    }
  } else if (isObject(source)) {
    if (source[Symbol.iterator]) {
      ret = Array.from(
        source,
        (item, i) => renderItem(item, i, void 0, cached)
      );
    } else {
      const keys = Object.keys(source);
      ret = new Array(keys.length);
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i];
        ret[i] = renderItem(source[key], key, i, cached);
      }
    }
  } else {
    ret = [];
  }
  return ret;
}
function renderSlot(slots, name, props, fallback, noSlotted, branchKey) {
  if (props == null) props = {};
  if (currentRenderingInstance.ce || currentRenderingInstance.parent && isAsyncWrapper(currentRenderingInstance.parent) && currentRenderingInstance.parent.ce) {
    const slotProps = props;
    const hasProps = Object.keys(slotProps).length > 0;
    if (name !== "default") slotProps.name = name;
    return openBlock(), createBlock(
      Fragment,
      null,
      [createVNode("slot", slotProps, fallback && fallback())],
      hasProps ? -2 : 64
    );
  }
  let slot = slots[name];
  if (slot && slot._c) {
    slot._d = false;
  }
  const prevStackSize = blockStack.length;
  openBlock();
  let rendered;
  try {
    const validSlotContent = slot && ensureValidVNode(slot(props));
    const slotKey = props.key || branchKey || // slot content array of a dynamic conditional slot may have a branch
    // key attached in the `createSlots` helper, respect that
    validSlotContent && validSlotContent.key;
    rendered = createBlock(
      Fragment,
      {
        key: (slotKey && !isSymbol(slotKey) ? slotKey : `_${name}`) + // #7256 force differentiate fallback content from actual content
        (!validSlotContent && fallback ? "_fb" : "")
      },
      validSlotContent || (fallback ? fallback() : []),
      validSlotContent && slots._ === 1 ? 64 : -2
    );
  } catch (err) {
    for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
    throw err;
  } finally {
    if (slot && slot._c) {
      slot._d = true;
    }
  }
  if (!noSlotted && rendered.scopeId) {
    rendered.slotScopeIds = [rendered.scopeId + "-s"];
  }
  return rendered;
}
function ensureValidVNode(vnodes) {
  return vnodes.some((child) => {
    if (!isVNode(child)) return true;
    if (child.type === Comment) return false;
    if (child.type === Fragment && !ensureValidVNode(child.children))
      return false;
    return true;
  }) ? vnodes : null;
}
const getPublicInstance = (i) => {
  if (!i) return null;
  if (isStatefulComponent(i)) return getComponentPublicInstance(i);
  return getPublicInstance(i.parent);
};
const publicPropertiesMap = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
    $: (i) => i,
    $el: (i) => i.vnode.el,
    $data: (i) => i.data,
    $props: (i) => i.props,
    $attrs: (i) => i.attrs,
    $slots: (i) => i.slots,
    $refs: (i) => i.refs,
    $parent: (i) => getPublicInstance(i.parent),
    $root: (i) => getPublicInstance(i.root),
    $host: (i) => i.ce,
    $emit: (i) => i.emit,
    $options: (i) => resolveMergedOptions(i) ,
    $forceUpdate: (i) => i.f || (i.f = () => {
      queueJob(i.update);
    }),
    $nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
    $watch: (i) => instanceWatch.bind(i) 
  })
);
const hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === "__v_skip") {
      return true;
    }
    const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
    if (key[0] !== "$") {
      const n = accessCache[key];
      if (n !== void 0) {
        switch (n) {
          case 1:
            return setupState[key];
          case 2:
            return data[key];
          case 4:
            return ctx[key];
          case 3:
            return props[key];
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1;
        return setupState[key];
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2;
        return data[key];
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4;
        return ctx[key];
      } else if (shouldCacheAccess) {
        accessCache[key] = 0;
      }
    }
    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties;
    if (publicGetter) {
      if (key === "$attrs") {
        track(instance.attrs, "get", "");
      }
      return publicGetter(instance);
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) && (cssModule = cssModule[key])
    ) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4;
      return ctx[key];
    } else if (
      // global properties
      globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)
    ) {
      {
        return globalProperties[key];
      }
    } else ;
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance;
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value;
      return true;
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
      return true;
    } else if (hasOwn(instance.props, key)) {
      return false;
    }
    if (key[0] === "$" && key.slice(1) in instance) {
      return false;
    } else {
      {
        ctx[key] = value;
      }
    }
    return true;
  },
  has({
    _: { data, setupState, accessCache, ctx, appContext, props, type }
  }, key) {
    let cssModules;
    return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0;
    } else if (hasOwn(descriptor, "value")) {
      this.set(target, key, descriptor.value, null);
    }
    return Reflect.defineProperty(target, key, descriptor);
  }
};
function normalizePropsOrEmits(props) {
  return isArray$1(props) ? props.reduce(
    (normalized, p) => (normalized[p] = null, normalized),
    {}
  ) : props;
}
let shouldCacheAccess = true;
function applyOptions(instance) {
  const options = resolveMergedOptions(instance);
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  shouldCacheAccess = false;
  if (options.beforeCreate) {
    callHook$1(options.beforeCreate, instance, "bc");
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters
  } = options;
  const checkDuplicateProperties = null;
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties);
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];
      if (isFunction(methodHandler)) {
        {
          ctx[key] = methodHandler.bind(publicThis);
        }
      }
    }
  }
  if (dataOptions) {
    const data = dataOptions.call(publicThis, publicThis);
    if (!isObject(data)) ; else {
      instance.data = reactive(data);
    }
  }
  shouldCacheAccess = true;
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      const set = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP;
      const c = computed({
        get,
        set
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: (v) => c.value = v
      });
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key);
    }
  }
  if (provideOptions) {
    const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key]);
    });
  }
  if (created) {
    callHook$1(created, instance, "c");
  }
  function registerLifecycleHook(register, hook) {
    if (isArray$1(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)));
    } else if (hook) {
      register(hook.bind(publicThis));
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
  registerLifecycleHook(onBeforeUpdate, beforeUpdate);
  registerLifecycleHook(onUpdated, updated);
  registerLifecycleHook(onActivated, activated);
  registerLifecycleHook(onDeactivated, deactivated);
  registerLifecycleHook(onErrorCaptured, errorCaptured);
  registerLifecycleHook(onRenderTracked, renderTracked);
  registerLifecycleHook(onRenderTriggered, renderTriggered);
  registerLifecycleHook(onBeforeUnmount, beforeUnmount);
  registerLifecycleHook(onUnmounted, unmounted);
  registerLifecycleHook(onServerPrefetch, serverPrefetch);
  if (isArray$1(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {});
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => publicThis[key] = val,
          enumerable: true
        });
      });
    } else if (!instance.exposed) {
      instance.exposed = {};
    }
  }
  if (render && instance.render === NOOP) {
    instance.render = render;
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs;
  }
  if (components) instance.components = components;
  if (directives) instance.directives = directives;
  if (serverPrefetch) {
    markAsyncBoundary(instance);
  }
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
  if (isArray$1(injectOptions)) {
    injectOptions = normalizeInject(injectOptions);
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key];
    let injected;
    if (isObject(opt)) {
      if ("default" in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true
        );
      } else {
        injected = inject(opt.from || key);
      }
    } else {
      injected = inject(opt);
    }
    if (isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v) => injected.value = v
      });
    } else {
      ctx[key] = injected;
    }
  }
}
function callHook$1(hook, instance, type) {
  callWithAsyncErrorHandling(
    isArray$1(hook) ? hook.map((h2) => h2.bind(instance.proxy)) : hook.bind(instance.proxy),
    instance,
    type
  );
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
  if (isString(raw)) {
    const handler = ctx[raw];
    if (isFunction(handler)) {
      {
        watch(getter, handler);
      }
    }
  } else if (isFunction(raw)) {
    {
      watch(getter, raw.bind(publicThis));
    }
  } else if (isObject(raw)) {
    if (isArray$1(raw)) {
      raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
    } else {
      const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
      if (isFunction(handler)) {
        watch(getter, handler, raw);
      }
    }
  } else ;
}
function resolveMergedOptions(instance) {
  const base = instance.type;
  const { mixins, extends: extendsOptions } = base;
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies }
  } = instance.appContext;
  const cached = cache.get(base);
  let resolved;
  if (cached) {
    resolved = cached;
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base;
    }
  } else {
    resolved = {};
    if (globalMixins.length) {
      globalMixins.forEach(
        (m) => mergeOptions$1(resolved, m, optionMergeStrategies, true)
      );
    }
    mergeOptions$1(resolved, base, optionMergeStrategies);
  }
  if (isObject(base)) {
    cache.set(base, resolved);
  }
  return resolved;
}
function mergeOptions$1(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from;
  if (extendsOptions) {
    mergeOptions$1(to, extendsOptions, strats, true);
  }
  if (mixins) {
    mixins.forEach(
      (m) => mergeOptions$1(to, m, strats, true)
    );
  }
  for (const key in from) {
    if (asMixin && key === "expose") ; else {
      const strat = internalOptionMergeStrats[key] || strats && strats[key];
      to[key] = strat ? strat(to[key], from[key]) : from[key];
    }
  }
  return to;
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject
};
function mergeDataFn(to, from) {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  return function mergedDataFn() {
    return extend(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from
    );
  };
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
  if (isArray$1(raw)) {
    const res = {};
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i];
    }
    return res;
  }
  return raw;
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
  return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray$1(to) && isArray$1(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])];
    }
    return extend(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {})
    );
  } else {
    return from;
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from;
  if (!from) return to;
  const merged = extend(/* @__PURE__ */ Object.create(null), to);
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key]);
  }
  return merged;
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let uid$1 = 0;
function createAppAPI(render, hydrate) {
  return function createApp(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent);
    }
    if (rootProps != null && !isObject(rootProps)) {
      rootProps = null;
    }
    const context = createAppContext();
    const installedPlugins = /* @__PURE__ */ new WeakSet();
    const pluginCleanupFns = [];
    let isMounted = false;
    const app = context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config;
      },
      set config(v) {
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) ; else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app, ...options);
        } else ;
        return app;
      },
      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          }
        }
        return app;
      },
      component(name, component) {
        if (!component) {
          return context.components[name];
        }
        context.components[name] = component;
        return app;
      },
      directive(name, directive) {
        if (!directive) {
          return context.directives[name];
        }
        context.directives[name] = directive;
        return app;
      },
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          const vnode = app._ceVNode || createVNode(rootComponent, rootProps);
          vnode.appContext = context;
          if (namespace === true) {
            namespace = "svg";
          } else if (namespace === false) {
            namespace = void 0;
          }
          {
            render(vnode, rootContainer, namespace);
          }
          isMounted = true;
          app._container = rootContainer;
          rootContainer.__vue_app__ = app;
          return getComponentPublicInstance(vnode.component);
        }
      },
      onUnmount(cleanupFn) {
        pluginCleanupFns.push(cleanupFn);
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app._instance,
            16
          );
          render(null, app._container);
          delete app._container.__vue_app__;
        }
      },
      provide(key, value) {
        context.provides[key] = value;
        return app;
      },
      runWithContext(fn) {
        const lastApp = currentApp;
        currentApp = app;
        try {
          return fn();
        } finally {
          currentApp = lastApp;
        }
      }
    };
    return app;
  };
}
let currentApp = null;
const getModelModifiers = (props, modelName) => {
  return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event, ...rawArgs) {
  if (instance.isUnmounted) return;
  const props = instance.vnode.props || EMPTY_OBJ;
  let args = rawArgs;
  const isModelListener2 = event.startsWith("update:");
  const modifiers = isModelListener2 && getModelModifiers(props, event.slice(7));
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a) => isString(a) ? a.trim() : a);
    }
    if (modifiers.number) {
      args = args.map(looseToNumber);
    }
  }
  let handlerName;
  let handler = props[handlerName = toHandlerKey(event)] || // also try camelCase event handler (#2249)
  props[handlerName = toHandlerKey(camelize(event))];
  if (!handler && isModelListener2) {
    handler = props[handlerName = toHandlerKey(hyphenate(event))];
  }
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      6,
      args
    );
  }
  const onceHandler = props[handlerName + `Once`];
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {};
    } else if (instance.emitted[handlerName]) {
      return;
    }
    instance.emitted[handlerName] = true;
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      6,
      args
    );
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
  const cached = cache.get(comp);
  if (cached !== void 0) {
    return cached;
  }
  const raw = comp.emits;
  let normalized = {};
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
      if (normalizedFromExtend) {
        hasExtends = true;
        extend(normalized, normalizedFromExtend);
      }
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits);
    }
    if (comp.extends) {
      extendEmits(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null);
    }
    return null;
  }
  if (isArray$1(raw)) {
    raw.forEach((key) => normalized[key] = null);
  } else {
    extend(normalized, raw);
  }
  if (isObject(comp)) {
    cache.set(comp, normalized);
  }
  return normalized;
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false;
  }
  key = key.slice(2);
  key = key === "Once" ? key : key.replace(/Once$/, "");
  return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
function markAttrsAccessed() {
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit2,
    render,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs
  } = instance;
  const prev = setCurrentRenderingInstance(instance);
  let result;
  let fallthroughAttrs;
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy;
      const thisProxy = false ? new Proxy(proxyToUse, {
        get(target, key, receiver) {
          warn$1(
            `Property '${String(
              key
            )}' was accessed via 'this'. Avoid using 'this' in templates.`
          );
          return Reflect.get(target, key, receiver);
        }
      }) : proxyToUse;
      result = normalizeVNode(
        render.call(
          thisProxy,
          proxyToUse,
          renderCache,
          false ? shallowReadonly(props) : props,
          setupState,
          data,
          ctx
        )
      );
      fallthroughAttrs = attrs;
    } else {
      const render2 = Component;
      if (false) ;
      result = normalizeVNode(
        render2.length > 1 ? render2(
          false ? shallowReadonly(props) : props,
          false ? {
            get attrs() {
              markAttrsAccessed();
              return shallowReadonly(attrs);
            },
            slots,
            emit: emit2
          } : { attrs, slots, emit: emit2 }
        ) : render2(
          false ? shallowReadonly(props) : props,
          null
        )
      );
      fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
    }
  } catch (err) {
    blockStack.length = 0;
    handleError(err, instance, 1);
    result = createVNode(Comment);
  }
  let root = result;
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs);
    const { shapeFlag } = root;
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions
          );
        }
        root = cloneVNode(root, fallthroughAttrs, false, true);
      }
    }
  }
  if (vnode.dirs) {
    root = cloneVNode(root, null, false, true);
    root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
  }
  if (vnode.transition) {
    const child = isTeleport(root.type) ? getInnerChild$1(root) || root : root;
    setTransitionHooks(child, vnode.transition);
  }
  {
    result = root;
  }
  setCurrentRenderingInstance(prev);
  return result;
}
const getFunctionalFallthrough = (attrs) => {
  let res;
  for (const key in attrs) {
    if (key === "class" || key === "style" || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }
  return res;
};
const filterModelListeners = (attrs, props) => {
  const res = {};
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key];
    }
  }
  return res;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode;
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
  const emits = component.emitsOptions;
  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true;
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps;
      }
      return hasPropsChanged(prevProps, nextProps, emits);
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps;
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i];
        if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) {
          return true;
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }
    if (prevProps === nextProps) {
      return false;
    }
    if (!prevProps) {
      return !!nextProps;
    }
    if (!nextProps) {
      return true;
    }
    return hasPropsChanged(prevProps, nextProps, emits);
  }
  return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) {
      return true;
    }
  }
  return false;
}
function hasPropValueChanged(nextProps, prevProps, key) {
  const nextProp = nextProps[key];
  const prevProp = prevProps[key];
  if (key === "style" && isObject(nextProp) && isObject(prevProp)) {
    return !looseEqual(nextProp, prevProp);
  }
  return nextProp !== prevProp;
}
function updateHOCHostEl({ vnode, parent, suspense }, el) {
  while (parent) {
    const root = parent.subTree;
    if (root.suspense && root.suspense.activeBranch === vnode) {
      root.suspense.vnode.el = root.el = el;
      vnode = root;
    }
    if (root === vnode) {
      (vnode = parent.vnode).el = el;
      parent = parent.parent;
    } else {
      break;
    }
  }
  if (suspense && suspense.activeBranch === vnode) {
    suspense.vnode.el = el;
  }
}
const internalObjectProto = {};
const createInternalObject = () => Object.create(internalObjectProto);
const isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {};
  const attrs = createInternalObject();
  instance.propsDefaults = /* @__PURE__ */ Object.create(null);
  setFullProps(instance, rawProps, props, attrs);
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0;
    }
  }
  if (isStateful) {
    instance.props = isSSR ? props : shallowReactive(props);
  } else {
    if (!instance.type.props) {
      instance.props = attrs;
    } else {
      instance.props = props;
    }
  }
  instance.attrs = attrs;
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance;
  const rawCurrentProps = toRaw(props);
  const [options] = instance.propsOptions;
  let hasAttrsChanged = false;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (optimized || patchFlag > 0) && !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps;
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i];
        if (isEmitListener(instance.emitsOptions, key)) {
          continue;
        }
        const value = rawProps[key];
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value;
              hasAttrsChanged = true;
            }
          } else {
            const camelizedKey = camelize(key);
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false
            );
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value;
            hasAttrsChanged = true;
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true;
    }
    let kebabKey;
    for (const key in rawCurrentProps) {
      if (!rawProps || // for camelCase
      !hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && // for camelCase
          (rawPrevProps[key] !== void 0 || // for kebab-case
          rawPrevProps[kebabKey] !== void 0)) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true
            );
          }
        } else {
          delete props[key];
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key) && true) {
          delete attrs[key];
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, "set", "");
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions;
  let hasAttrsChanged = false;
  let rawCastValues;
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue;
      }
      const value = rawProps[key];
      let camelKey;
      if (options && hasOwn(options, camelKey = camelize(key))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value;
        } else {
          (rawCastValues || (rawCastValues = {}))[camelKey] = value;
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value;
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = toRaw(props);
    const castValues = rawCastValues || EMPTY_OBJ;
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i];
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key)
      );
    }
  }
  return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key];
  if (opt != null) {
    const hasDefault = hasOwn(opt, "default");
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default;
      if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
        const { propsDefaults } = instance;
        if (key in propsDefaults) {
          value = propsDefaults[key];
        } else {
          const reset = setCurrentInstance(instance);
          value = propsDefaults[key] = defaultValue.call(
            null,
            props
          );
          reset();
        }
      } else {
        value = defaultValue;
      }
      if (instance.ce) {
        instance.ce._setProp(key, value);
      }
    }
    if (opt[
      0
      /* shouldCast */
    ]) {
      if (isAbsent && !hasDefault) {
        value = false;
      } else if (opt[
        1
        /* shouldCastTrue */
      ] && (value === "" || value === hyphenate(key))) {
        value = true;
      }
    }
  }
  return value;
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinPropsCache : appContext.propsCache;
  const cached = cache.get(comp);
  if (cached) {
    return cached;
  }
  const raw = comp.props;
  const normalized = {};
  const needCastKeys = [];
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true;
      const [props, keys] = normalizePropsOptions(raw2, appContext, true);
      extend(normalized, props);
      if (keys) needCastKeys.push(...keys);
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps);
    }
    if (comp.extends) {
      extendProps(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR);
    }
    return EMPTY_ARR;
  }
  if (isArray$1(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const normalizedKey = camelize(raw[i]);
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else if (raw) {
    for (const key in raw) {
      const normalizedKey = camelize(key);
      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray$1(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
        const propType = prop.type;
        let shouldCast = false;
        let shouldCastTrue = true;
        if (isArray$1(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index];
            const typeName = isFunction(type) && type.name;
            if (typeName === "Boolean") {
              shouldCast = true;
              break;
            } else if (typeName === "String") {
              shouldCastTrue = false;
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === "Boolean";
        }
        prop[
          0
          /* shouldCast */
        ] = shouldCast;
        prop[
          1
          /* shouldCastTrue */
        ] = shouldCastTrue;
        if (shouldCast || hasOwn(prop, "default")) {
          needCastKeys.push(normalizedKey);
        }
      }
    }
  }
  const res = [normalized, needCastKeys];
  if (isObject(comp)) {
    cache.set(comp, res);
  }
  return res;
}
function validatePropName(key) {
  if (key[0] !== "$" && !isReservedProp(key)) {
    return true;
  }
  return false;
}
const isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
const normalizeSlotValue = (value) => isArray$1(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
const normalizeSlot$1 = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot;
  }
  const normalized = withCtx((...args) => {
    if (false) ;
    return normalizeSlotValue(rawSlot(...args));
  }, ctx);
  normalized._c = false;
  return normalized;
};
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx;
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];
    if (isFunction(value)) {
      slots[key] = normalizeSlot$1(key, value, ctx);
    } else if (value != null) {
      const normalized = normalizeSlotValue(value);
      slots[key] = () => normalized;
    }
  }
};
const normalizeVNodeSlots = (instance, children) => {
  const normalized = normalizeSlotValue(children);
  instance.slots.default = () => normalized;
};
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key];
    }
  }
};
const initSlots = (instance, children, optimized) => {
  const slots = instance.slots = createInternalObject();
  if (instance.vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      assignSlots(slots, children, optimized);
      if (optimized) {
        def(slots, "_", type, true);
      }
    } else {
      normalizeObjectSlots(children, slots);
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children);
  }
};
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;
  if (vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      if (optimized && type === 1) {
        needDeletionCheck = false;
      } else {
        assignSlots(slots, children, optimized);
      }
    } else {
      needDeletionCheck = !children.$stable;
      normalizeObjectSlots(children, slots);
    }
    deletionComparisonTarget = children;
  } else if (children) {
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = { default: 1 };
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key];
      }
    }
  }
};
const queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
  return baseCreateRenderer(options);
}
function baseCreateRenderer(options, createHydrationFns) {
  const target = getGlobalThis();
  target.__VUE__ = true;
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent
  } = options;
  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
    if (n1 === n2) {
      return;
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }
    if (n2.patchFlag === -2) {
      optimized = false;
      n2.dynamicChildren = null;
    }
    const { type, ref: ref3, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        break;
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 64) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (shapeFlag & 128) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else ;
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true);
    }
  };
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateText(n2.children),
        container,
        anchor
      );
    } else {
      const el = n2.el = n1.el;
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateComment(n2.children || ""),
        container,
        anchor
      );
    } else {
      n2.el = n1.el;
    }
  };
  const mountStaticNode = (n2, container, anchor, namespace) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor
    );
  };
  const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostInsert(el, container, nextSibling);
      el = next;
    }
    hostInsert(anchor, container, nextSibling);
  };
  const removeStaticNode = ({ el, anchor }) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostRemove(el);
      el = next;
    }
    hostRemove(anchor);
  };
  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    if (n2.type === "svg") {
      namespace = "svg";
    } else if (n2.type === "math") {
      namespace = "mathml";
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
      try {
        if (customElement) {
          customElement._beginPatch();
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } finally {
        if (customElement) {
          customElement._endPatch();
        }
      }
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let el;
    let vnodeHook;
    const { props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace,
      props && props.is,
      props
    );
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized
      );
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "created");
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    if (props) {
      for (const key in props) {
        if (key !== "value" && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace, parentComponent);
        }
      }
      if ("value" in props) {
        hostPatchProp(el, "value", null, props.value, namespace);
      }
      if (vnodeHook = props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode);
      }
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition);
    if (needCallTransitionHooks) {
      transition.beforeEnter(el);
    }
    hostInsert(el, container, anchor);
    if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
      queuePostRenderEffect(() => {
        try {
          vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
          needCallTransitionHooks && transition.enter(el);
          dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
        } finally {
        }
      }, parentSuspense);
    }
  };
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId);
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i]);
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree;
      if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
        const parentVNode = parentComponent.vnode;
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent
        );
      }
    }
  };
  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start = 0) => {
    for (let i = start; i < children.length; i++) {
      const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
  };
  const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const el = n2.el = n1.el;
    let { patchFlag, dynamicChildren, dirs } = n2;
    patchFlag |= n1.patchFlag & 16;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;
    parentComponent && toggleRecurse(parentComponent, false);
    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
    }
    parentComponent && toggleRecurse(parentComponent, true);
    if (
      // #6385 the old vnode may be a user-wrapped non-isomorphic block
      // Force full diff when block metadata is unstable.
      dynamicChildren && (!n1.dynamicChildren || n1.dynamicChildren.length !== dynamicChildren.length)
    ) {
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }
    if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) {
      hostSetElementText(el, "");
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds
      );
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false
      );
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace);
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, "class", null, newProps.class, namespace);
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps;
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i];
            const prev = oldProps[key];
            const next = newProps[key];
            if (next !== prev || key === "value") {
              hostPatchProp(el, key, prev, next, namespace, parentComponent);
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace);
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
      }, parentSuspense);
    }
  };
  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const newVNode = newChildren[i];
      const container = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldVNode.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & (6 | 64 | 128)) ? hostParentNode(oldVNode.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          fallbackContainer
        )
      );
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true
      );
    }
  };
  const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              parentComponent
            );
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev && key !== "value") {
          hostPatchProp(el, key, prev, next, namespace, parentComponent);
        }
      }
      if ("value" in newProps) {
        hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
      }
    }
  };
  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null || parentComponent && n2 === parentComponent.subTree
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true
            /* shallow */
          );
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace,
          optimized
        );
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
    const instance = initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    );
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }
    {
      setupComponent(instance, false, optimized);
    }
    if (instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized);
      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
        initialVNode.placeholder = placeholder.el;
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized
      );
    }
  };
  const updateComponent = (n1, n2, optimized) => {
    const instance = n2.component = n1.component;
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        updateComponentPreRender(instance, n2, optimized);
        return;
      } else {
        instance.next = n2;
        instance.update();
      }
    } else {
      n2.el = n1.el;
      instance.vnode = n2;
    }
  };
  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook;
        const { el, props } = initialVNode;
        const { bm, m, parent, root, type } = instance;
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
        toggleRecurse(instance, false);
        if (bm) {
          invokeArrayFns(bm);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }
        toggleRecurse(instance, true);
        {
          if (root.ce && root.ce._hasShadowRoot()) {
            root.ce._injectChildStyle(
              type,
              instance.parent ? instance.parent.type : void 0
            );
          }
          const subTree = instance.subTree = renderComponentRoot(instance);
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace
          );
          initialVNode.el = subTree.el;
        }
        if (m) {
          queuePostRenderEffect(m, parentSuspense);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
          const scopedInitialVNode = initialVNode;
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense
          );
        }
        if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        }
        instance.isMounted = true;
        initialVNode = container = anchor = null;
      } else {
        let { next, bu, u, parent, vnode } = instance;
        {
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
          if (nonHydratedAsyncRoot) {
            if (next) {
              next.el = vnode.el;
              updateComponentPreRender(instance, next, optimized);
            }
            nonHydratedAsyncRoot.asyncDep.then(() => {
              queuePostRenderEffect(() => {
                if (!instance.isUnmounted) update();
              }, parentSuspense);
            });
            return;
          }
        }
        let originNext = next;
        let vnodeHook;
        toggleRecurse(instance, false);
        if (next) {
          next.el = vnode.el;
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }
        if (bu) {
          invokeArrayFns(bu);
        }
        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        }
        toggleRecurse(instance, true);
        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace
        );
        next.el = nextTree.el;
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el);
        }
        if (u) {
          queuePostRenderEffect(u, parentSuspense);
        }
        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense
          );
        }
      }
    };
    instance.scope.on();
    const effect2 = instance.effect = new ReactiveEffect(componentUpdateFn);
    instance.scope.off();
    const update = instance.update = effect2.run.bind(effect2);
    const job = instance.job = effect2.runIfDirty.bind(effect2);
    job.i = instance;
    job.id = instance.uid;
    effect2.scheduler = () => queueJob(job);
    toggleRecurse(instance, true);
    update();
  };
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children, optimized);
    pauseTracking();
    flushPreFlushCbs(instance);
    resetTracking();
  };
  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const { patchFlag, shapeFlag } = n2;
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true);
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, "");
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };
  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;
    for (i = 0; i < commonLength; i++) {
      const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      );
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength
      );
    }
  };
  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      i++;
    }
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      e1--;
      e2--;
    }
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
        while (i <= e2) {
          patch(
            null,
            c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          i++;
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true);
        i++;
      }
    } else {
      const s1 = i;
      const s2 = i;
      const keyToNewIndexMap = /* @__PURE__ */ new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
        if (nextChild.key != null) {
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }
      let j;
      let patched = 0;
      const toBePatched = e2 - s2 + 1;
      let moved = false;
      let maxNewIndexSoFar = 0;
      const newIndexToOldIndexMap = new Array(toBePatched);
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true);
          continue;
        }
        let newIndex;
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          for (j = s2; j <= e2; j++) {
            if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
              newIndex = j;
              break;
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true);
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          patched++;
        }
      }
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
      j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchorVNode = c2[nextIndex + 1];
        const anchor = nextIndex + 1 < l2 ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
        ) : parentAnchor;
        if (newIndexToOldIndexMap[i] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, 2);
          } else {
            j--;
          }
        }
      }
    }
  };
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type, transition, children, shapeFlag } = vnode;
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType);
      return;
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType);
      return;
    }
    if (shapeFlag & 64) {
      type.move(vnode, container, anchor, internals);
      return;
    }
    if (type === Fragment) {
      hostInsert(el, container, anchor);
      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType);
      }
      hostInsert(vnode.anchor, container, anchor);
      return;
    }
    if (type === Static) {
      moveStaticNode(vnode, container, anchor);
      return;
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition;
    if (needTransition2) {
      if (moveType === 0) {
        if (transition.persisted && !el[leaveCbKey]) {
          hostInsert(el, container, anchor);
        } else {
          transition.beforeEnter(el);
          hostInsert(el, container, anchor);
          queuePostRenderEffect(() => transition.enter(el), parentSuspense);
        }
      } else {
        const { leave, delayLeave, afterLeave } = transition;
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el);
          } else {
            hostInsert(el, container, anchor);
          }
        };
        const performLeave = () => {
          const wasLeaving = el._isLeaving || !!el[leaveCbKey];
          if (el._isLeaving) {
            el[leaveCbKey](
              true
              /* cancelled */
            );
          }
          if (transition.persisted && !wasLeaving) {
            remove22();
          } else {
            leave(el, () => {
              remove22();
              afterLeave && afterLeave();
            });
          }
        };
        if (delayLeave) {
          delayLeave(el, remove22, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };
  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
    const {
      type,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex,
      memo
    } = vnode;
    if (patchFlag === -2) {
      optimized = false;
    }
    if (ref3 != null) {
      pauseTracking();
      setRef(ref3, null, parentSuspense, vnode, true);
      resetTracking();
    }
    if (cacheIndex != null) {
      parentComponent.renderCache[cacheIndex] = void 0;
    }
    if (shapeFlag & 256) {
      parentComponent.ctx.deactivate(vnode);
      return;
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs;
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
    let vnodeHook;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove);
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove);
        return;
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove
        );
      } else if (dynamicChildren && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (type !== Fragment || patchFlag > 0 && patchFlag & 64)) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true
        );
      } else if (type === Fragment && patchFlag & (128 | 256) || !optimized && shapeFlag & 16) {
        unmountChildren(children, parentComponent, parentSuspense);
      }
      if (doRemove) {
        remove2(vnode);
      }
    }
    const shouldInvalidateMemo = memo != null && cacheIndex == null;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
        if (shouldInvalidateMemo) {
          vnode.el = null;
        }
      }, parentSuspense);
    }
  };
  const remove2 = (vnode) => {
    const { type, el, anchor, transition } = vnode;
    if (type === Fragment) {
      {
        removeFragment(el, anchor);
      }
      return;
    }
    if (type === Static) {
      removeStaticNode(vnode);
      return;
    }
    const performRemove = () => {
      hostRemove(el);
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };
    if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition;
      const performLeave = () => leave(el, performRemove);
      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };
  const removeFragment = (cur, end) => {
    let next;
    while (cur !== end) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }
    hostRemove(end);
  };
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    const { bum, scope, job, subTree, um, m, a } = instance;
    invalidateMount(m);
    invalidateMount(a);
    if (bum) {
      invokeArrayFns(bum);
    }
    scope.stop();
    if (job) {
      job.flags |= 8;
      unmount(subTree, instance, parentSuspense, doRemove);
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true;
    }, parentSuspense);
  };
  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
    }
  };
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree);
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next();
    }
    const el = hostNextSibling(vnode.anchor || vnode.el);
    const teleportEnd = el && el[TeleportEndKey];
    return teleportEnd ? hostNextSibling(teleportEnd) : el;
  };
  let isFlushing = false;
  const render = (vnode, container, namespace) => {
    let instance;
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
        instance = container._vnode.component;
      }
    } else {
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace
      );
    }
    container._vnode = vnode;
    if (!isFlushing) {
      isFlushing = true;
      flushPreFlushCbs(instance);
      flushPostFlushCbs();
      isFlushing = false;
    }
  };
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate;
  return {
    render,
    hydrate,
    createApp: createAppAPI(render)
  };
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
  return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32;
    job.flags |= 4;
  } else {
    effect2.flags &= -33;
    job.flags &= -5;
  }
}
function needTransition(parentSuspense, transition) {
  return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children;
  const ch2 = n2.children;
  if (isArray$1(ch1) && isArray$1(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      const c1 = ch1[i];
      let c2 = ch2[i];
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i] = cloneIfMounted(ch2[i]);
          c2.el = c1.el;
        }
        if (!shallow && c2.patchFlag !== -2)
          traverseStaticChildren(c1, c2);
      }
      if (c2.type === Text) {
        if (c2.patchFlag === -1) {
          c2 = ch2[i] = cloneIfMounted(c2);
        }
        c2.el = c1.el;
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el;
      }
    }
  }
}
function getSequence(arr) {
  const p = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = u + v >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}
function locateNonHydratedAsyncRoot(instance) {
  const subComponent = instance.subTree.component;
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent;
    } else {
      return locateNonHydratedAsyncRoot(subComponent);
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i = 0; i < hooks.length; i++)
      hooks[i].flags |= 8;
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder;
  }
  const instance = anchorVnode.component;
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree);
  }
  return null;
}
const isSuspense = (type) => type.__isSuspense;
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray$1(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
const Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
const Text = /* @__PURE__ */ Symbol.for("v-txt");
const Comment = /* @__PURE__ */ Symbol.for("v-cmt");
const Static = /* @__PURE__ */ Symbol.for("v-stc");
const blockStack = [];
let currentBlock = null;
function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null;
}
let isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value;
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true;
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
  closeBlock();
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode);
  }
  return vnode;
}
function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
  return setupBlock(
    createBaseVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag,
      true
    )
  );
}
function createBlock(type, props, children, patchFlag, dynamicProps) {
  return setupBlock(
    createVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      true
    )
  );
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
const normalizeKey = ({ key }) => key != null ? key : null;
const normalizeRef = ({
  ref: ref3,
  ref_key,
  ref_for
}) => {
  if (typeof ref3 === "number") {
    ref3 = "" + ref3;
  }
  return ref3 != null ? isString(ref3) || isRef(ref3) || isFunction(ref3) ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for } : ref3 : null;
};
function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance
  };
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    if (shapeFlag & 128) {
      type.normalize(vnode);
    }
  } else if (children) {
    vnode.shapeFlag |= isString(children) ? 8 : 16;
  }
  if (isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
  !isBlockNode && // has current parent block
  currentBlock && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  vnode.patchFlag !== 32) {
    currentBlock.push(vnode);
  }
  return vnode;
}
const createVNode = _createVNode;
function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    type = Comment;
  }
  if (isVNode(type)) {
    const cloned = cloneVNode(
      type,
      props,
      true
      /* mergeRef: true */
    );
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag = -2;
    return cloned;
  }
  if (isClassComponent(type)) {
    type = type.__vccOpts;
  }
  if (props) {
    props = guardReactiveProps(props);
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject(style)) {
      if (isProxy(style) && !isArray$1(style)) {
        style = extend({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }
  const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
function guardReactiveProps(props) {
  if (!props) return null;
  return isProxy(props) || isInternalObject(props) ? extend({}, props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode;
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref: extraProps && extraProps.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      mergeRef && ref3 ? isArray$1(ref3) ? ref3.concat(normalizeRef(extraProps)) : [ref3, normalizeRef(extraProps)] : normalizeRef(extraProps)
    ) : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children: children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce
  };
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned,
      transition.clone(cloned)
    );
  }
  return cloned;
}
function createTextVNode(text = " ", flag = 0) {
  return createVNode(Text, null, text, flag);
}
function createCommentVNode(text = "", asBlock = false) {
  return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
}
function normalizeVNode(child) {
  if (child == null || typeof child === "boolean") {
    return createVNode(Comment);
  } else if (isArray$1(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    );
  } else if (isVNode(child)) {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}
function cloneIfMounted(child) {
  return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
  let type = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray$1(children)) {
    type = 16;
  } else if (typeof children === "object") {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default;
      if (slot) {
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type = 32;
      const slotFlag = children._;
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance;
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1;
        } else {
          children._ = 2;
          vnode.patchFlag |= 1024;
        }
      }
    }
  } else if (isFunction(children)) {
    if (shapeFlag & (1 | 64)) {
      normalizeChildren(vnode, { default: children });
      return;
    }
    children = { default: children, _ctx: currentRenderingInstance };
    type = 32;
  } else {
    children = String(children);
    if (shapeFlag & 64) {
      type = 16;
      children = [createTextVNode(children)];
    } else {
      type = 8;
    }
  }
  vnode.children = children;
  vnode.shapeFlag |= type;
}
function mergeProps(...args) {
  const ret = {};
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i];
    for (const key in toMerge) {
      if (key === "class") {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === "style") {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (isOn(key)) {
        const existing = ret[key];
        const incoming = toMerge[key];
        if (incoming && existing !== incoming && !(isArray$1(existing) && existing.includes(incoming))) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming;
        } else if (incoming == null && existing == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !isModelListener(key)) {
          ret[key] = incoming;
        }
      } else if (key !== "") {
        ret[key] = toMerge[key];
      }
    }
  }
  return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [
    vnode,
    prevVNode
  ]);
}
const emptyAppContext = createAppContext();
let uid = 0;
function createComponentInstance(vnode, parent, suspense) {
  const type = vnode.type;
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  {
    instance.ctx = { _: instance };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  if (vnode.ce) {
    vnode.ce(instance);
  }
  return instance;
}
let currentInstance = null;
const getCurrentInstance = () => currentInstance || currentRenderingInstance;
let internalSetCurrentInstance;
let setInSSRSetupState;
{
  const g = getGlobalThis();
  const registerGlobalSetter = (key, setter) => {
    let setters;
    if (!(setters = g[key])) setters = g[key] = [];
    setters.push(setter);
    return (v) => {
      if (setters.length > 1) setters.forEach((set) => set(v));
      else setters[0](v);
    };
  };
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v) => currentInstance = v
  );
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v) => isInSSRComponentSetup = v
  );
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance;
  internalSetCurrentInstance(instance);
  instance.scope.on();
  return () => {
    instance.scope.off();
    internalSetCurrentInstance(prev);
  };
};
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off();
  internalSetCurrentInstance(null);
};
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4;
}
let isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR);
  const { props, children } = instance.vnode;
  const isStateful = isStatefulComponent(instance);
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children, optimized || isSSR);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
  isSSR && setInSSRSetupState(false);
  return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type;
  instance.accessCache = /* @__PURE__ */ Object.create(null);
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
  const { setup } = Component;
  if (setup) {
    pauseTracking();
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    const reset = setCurrentInstance(instance);
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      0,
      [
        instance.props,
        setupContext
      ]
    );
    const isAsyncSetup = isPromise(setupResult);
    resetTracking();
    reset();
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance);
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
      if (isSSR) {
        return setupResult.then((resolvedResult) => {
          setInSSRSetupState(true);
          try {
            handleSetupResult(instance, resolvedResult, isSSR);
          } finally {
            setInSSRSetupState(false);
          }
        }).catch((e) => {
          handleError(e, instance, 0);
        });
      } else {
        instance.asyncDep = setupResult;
      }
    } else {
      handleSetupResult(instance, setupResult);
    }
  } else {
    finishComponentSetup(instance);
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult;
    } else {
      instance.render = setupResult;
    }
  } else if (isObject(setupResult)) {
    instance.setupState = proxyRefs(setupResult);
  } else ;
  finishComponentSetup(instance);
}
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type;
  if (!instance.render) {
    instance.render = Component.render || NOOP;
  }
  {
    const reset = setCurrentInstance(instance);
    pauseTracking();
    try {
      applyOptions(instance);
    } finally {
      resetTracking();
      reset();
    }
  }
}
const attrsProxyHandlers = {
  get(target, key) {
    track(target, "get", "");
    return target[key];
  }
};
function createSetupContext(instance) {
  const expose = (exposed) => {
    instance.exposed = exposed || {};
  };
  {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose
    };
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
      get(target, key) {
        if (key in target) {
          return target[key];
        } else if (key in publicPropertiesMap) {
          return publicPropertiesMap[key](instance);
        }
      },
      has(target, key) {
        return key in target || key in publicPropertiesMap;
      }
    }));
  } else {
    return instance.proxy;
  }
}
const classifyRE = /(?:^|[-_])\w/g;
const classify = (str) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, "");
function getComponentName(Component, includeInferred = true) {
  return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component);
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/);
    if (match) {
      name = match[1];
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key;
        }
      }
    };
    name = inferFromRegistry(instance.components) || instance.parent && inferFromRegistry(
      instance.parent.type.components
    ) || inferFromRegistry(instance.appContext.components);
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}
function isClassComponent(value) {
  return isFunction(value) && "__vccOpts" in value;
}
const computed = (getterOrOptions, debugOptions) => {
  const c = computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
  return c;
};
function h(type, propsOrChildren, children) {
  try {
    setBlockTracking(-1);
    const l = arguments.length;
    if (l === 2) {
      if (isObject(propsOrChildren) && !isArray$1(propsOrChildren)) {
        if (isVNode(propsOrChildren)) {
          return createVNode(type, null, [propsOrChildren]);
        }
        return createVNode(type, propsOrChildren);
      } else {
        return createVNode(type, null, propsOrChildren);
      }
    } else {
      if (l > 3) {
        children = Array.prototype.slice.call(arguments, 2);
      } else if (l === 3 && isVNode(children)) {
        children = [children];
      }
      return createVNode(type, propsOrChildren, children);
    }
  } finally {
    setBlockTracking(1);
  }
}
const version = "3.5.42";

/**
* @vue/runtime-dom v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let policy = void 0;
const tt = typeof window !== "undefined" && window.trustedTypes;
if (tt) {
  try {
    policy = /* @__PURE__ */ tt.createPolicy("vue", {
      createHTML: (val) => val
    });
  } catch (e) {
  }
}
const unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
const svgNS = "http://www.w3.org/2000/svg";
const mathmlNS = "http://www.w3.org/1998/Math/MathML";
const doc = typeof document !== "undefined" ? document : null;
const templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
const nodeOps = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },
  createElement: (tag, namespace, is, props) => {
    const el = namespace === "svg" ? doc.createElementNS(svgNS, tag) : namespace === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
    if (tag === "select" && props && props.multiple != null) {
      el.setAttribute("multiple", props.multiple);
    }
    return el;
  },
  createText: (text) => doc.createTextNode(text),
  createComment: (text) => doc.createComment(text),
  setText: (node, text) => {
    node.nodeValue = text;
  },
  setElementText: (el, text) => {
    el.textContent = text;
  },
  parentNode: (node) => node.parentNode,
  nextSibling: (node) => node.nextSibling,
  querySelector: (selector) => doc.querySelector(selector),
  setScopeId(el, id) {
    el.setAttribute(id, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    const before = anchor ? anchor.previousSibling : parent.lastChild;
    if (start && (start === end || start.nextSibling)) {
      while (true) {
        parent.insertBefore(start.cloneNode(true), anchor);
        if (start === end || !(start = start.nextSibling)) break;
      }
    } else {
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content
      );
      const template = templateContainer.content;
      if (namespace === "svg" || namespace === "mathml") {
        const wrapper = template.firstChild;
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild);
        }
        template.removeChild(wrapper);
      }
      parent.insertBefore(template, anchor);
    }
    return [
      // first
      before ? before.nextSibling : parent.firstChild,
      // last
      anchor ? anchor.previousSibling : parent.lastChild
    ];
  }
};
const TRANSITION = "transition";
const ANIMATION = "animation";
const vtcKey = /* @__PURE__ */ Symbol("_vtc");
const DOMTransitionPropsValidators = {
  name: String,
  type: String,
  css: {
    type: Boolean,
    default: true
  },
  duration: [String, Number, Object],
  enterFromClass: String,
  enterActiveClass: String,
  enterToClass: String,
  appearFromClass: String,
  appearActiveClass: String,
  appearToClass: String,
  leaveFromClass: String,
  leaveActiveClass: String,
  leaveToClass: String
};
const TransitionPropsValidators = /* @__PURE__ */ extend(
  {},
  BaseTransitionPropsValidators,
  DOMTransitionPropsValidators
);
const decorate$1 = (t) => {
  t.displayName = "Transition";
  t.props = TransitionPropsValidators;
  return t;
};
const Transition = /* @__PURE__ */ decorate$1(
  (props, { slots }) => h(BaseTransition, resolveTransitionProps(props), slots)
);
const callHook = (hook, args = []) => {
  if (isArray$1(hook)) {
    hook.forEach((h2) => h2(...args));
  } else if (hook) {
    hook(...args);
  }
};
const hasExplicitCallback = (hook) => {
  return hook ? isArray$1(hook) ? hook.some((h2) => h2.length > 1) : hook.length > 1 : false;
};
function resolveTransitionProps(rawProps) {
  const baseProps = {};
  for (const key in rawProps) {
    if (!(key in DOMTransitionPropsValidators)) {
      baseProps[key] = rawProps[key];
    }
  }
  if (rawProps.css === false) {
    return baseProps;
  }
  const {
    name = "v",
    type,
    duration,
    enterFromClass = `${name}-enter-from`,
    enterActiveClass = `${name}-enter-active`,
    enterToClass = `${name}-enter-to`,
    appearFromClass = enterFromClass,
    appearActiveClass = enterActiveClass,
    appearToClass = enterToClass,
    leaveFromClass = `${name}-leave-from`,
    leaveActiveClass = `${name}-leave-active`,
    leaveToClass = `${name}-leave-to`
  } = rawProps;
  const durations = normalizeDuration(duration);
  const enterDuration = durations && durations[0];
  const leaveDuration = durations && durations[1];
  const {
    onBeforeEnter,
    onEnter,
    onEnterCancelled,
    onLeave,
    onLeaveCancelled,
    onBeforeAppear = onBeforeEnter,
    onAppear = onEnter,
    onAppearCancelled = onEnterCancelled
  } = baseProps;
  const finishEnter = (el, isAppear, done, isCancelled) => {
    el._enterCancelled = isCancelled;
    removeTransitionClass(el, isAppear ? appearToClass : enterToClass);
    removeTransitionClass(el, isAppear ? appearActiveClass : enterActiveClass);
    done && done();
  };
  const finishLeave = (el, done) => {
    el._isLeaving = false;
    removeTransitionClass(el, leaveFromClass);
    removeTransitionClass(el, leaveToClass);
    removeTransitionClass(el, leaveActiveClass);
    done && done();
  };
  const makeEnterHook = (isAppear) => {
    return (el, done) => {
      const hook = isAppear ? onAppear : onEnter;
      const resolve = () => finishEnter(el, isAppear, done);
      callHook(hook, [el, resolve]);
      nextFrame(() => {
        removeTransitionClass(el, isAppear ? appearFromClass : enterFromClass);
        addTransitionClass(el, isAppear ? appearToClass : enterToClass);
        if (!hasExplicitCallback(hook)) {
          whenTransitionEnds(el, type, enterDuration, resolve);
        }
      });
    };
  };
  return extend(baseProps, {
    onBeforeEnter(el) {
      callHook(onBeforeEnter, [el]);
      addTransitionClass(el, enterFromClass);
      addTransitionClass(el, enterActiveClass);
    },
    onBeforeAppear(el) {
      callHook(onBeforeAppear, [el]);
      addTransitionClass(el, appearFromClass);
      addTransitionClass(el, appearActiveClass);
    },
    onEnter: makeEnterHook(false),
    onAppear: makeEnterHook(true),
    onLeave(el, done) {
      el._isLeaving = true;
      const resolve = () => finishLeave(el, done);
      addTransitionClass(el, leaveFromClass);
      if (!el._enterCancelled) {
        forceReflow(el);
        addTransitionClass(el, leaveActiveClass);
      } else {
        addTransitionClass(el, leaveActiveClass);
        forceReflow(el);
      }
      nextFrame(() => {
        if (!el._isLeaving) {
          return;
        }
        removeTransitionClass(el, leaveFromClass);
        addTransitionClass(el, leaveToClass);
        if (!hasExplicitCallback(onLeave)) {
          whenTransitionEnds(el, type, leaveDuration, resolve);
        }
      });
      callHook(onLeave, [el, resolve]);
    },
    onEnterCancelled(el) {
      finishEnter(el, false, void 0, true);
      callHook(onEnterCancelled, [el]);
    },
    onAppearCancelled(el) {
      finishEnter(el, true, void 0, true);
      callHook(onAppearCancelled, [el]);
    },
    onLeaveCancelled(el) {
      finishLeave(el);
      callHook(onLeaveCancelled, [el]);
    }
  });
}
function normalizeDuration(duration) {
  if (duration == null) {
    return null;
  } else if (isObject(duration)) {
    return [NumberOf(duration.enter), NumberOf(duration.leave)];
  } else {
    const n = NumberOf(duration);
    return [n, n];
  }
}
function NumberOf(val) {
  const res = toNumber(val);
  return res;
}
function addTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c) => c && el.classList.add(c));
  (el[vtcKey] || (el[vtcKey] = /* @__PURE__ */ new Set())).add(cls);
}
function removeTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c) => c && el.classList.remove(c));
  const _vtc = el[vtcKey];
  if (_vtc) {
    _vtc.delete(cls);
    if (!_vtc.size) {
      el[vtcKey] = void 0;
    }
  }
}
function nextFrame(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}
let endId = 0;
function whenTransitionEnds(el, expectedType, explicitTimeout, resolve) {
  const id = el._endId = ++endId;
  const resolveIfNotStale = () => {
    if (id === el._endId) {
      resolve();
    }
  };
  if (explicitTimeout != null) {
    return setTimeout(resolveIfNotStale, explicitTimeout);
  }
  const { type, timeout, propCount } = getTransitionInfo(el, expectedType);
  if (!type) {
    return resolve();
  }
  const endEvent = type + "end";
  let ended = 0;
  const end = () => {
    el.removeEventListener(endEvent, onEnd);
    resolveIfNotStale();
  };
  const onEnd = (e) => {
    if (e.target === el && ++ended >= propCount) {
      end();
    }
  };
  setTimeout(() => {
    if (ended < propCount) {
      end();
    }
  }, timeout + 1);
  el.addEventListener(endEvent, onEnd);
}
function getTransitionInfo(el, expectedType) {
  const styles = window.getComputedStyle(el);
  const getStyleProperties = (key) => (styles[key] || "").split(", ");
  const transitionDelays = getStyleProperties(`${TRANSITION}Delay`);
  const transitionDurations = getStyleProperties(`${TRANSITION}Duration`);
  const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
  const animationDelays = getStyleProperties(`${ANIMATION}Delay`);
  const animationDurations = getStyleProperties(`${ANIMATION}Duration`);
  const animationTimeout = getTimeout(animationDelays, animationDurations);
  let type = null;
  let timeout = 0;
  let propCount = 0;
  if (expectedType === TRANSITION) {
    if (transitionTimeout > 0) {
      type = TRANSITION;
      timeout = transitionTimeout;
      propCount = transitionDurations.length;
    }
  } else if (expectedType === ANIMATION) {
    if (animationTimeout > 0) {
      type = ANIMATION;
      timeout = animationTimeout;
      propCount = animationDurations.length;
    }
  } else {
    timeout = Math.max(transitionTimeout, animationTimeout);
    type = timeout > 0 ? transitionTimeout > animationTimeout ? TRANSITION : ANIMATION : null;
    propCount = type ? type === TRANSITION ? transitionDurations.length : animationDurations.length : 0;
  }
  const hasTransform = type === TRANSITION && /\b(?:transform|all)(?:,|$)/.test(
    getStyleProperties(`${TRANSITION}Property`).toString()
  );
  return {
    type,
    timeout,
    propCount,
    hasTransform
  };
}
function getTimeout(delays, durations) {
  while (delays.length < durations.length) {
    delays = delays.concat(delays);
  }
  return Math.max(...durations.map((d, i) => toMs(d) + toMs(delays[i])));
}
function toMs(s) {
  if (s === "auto") return 0;
  return Number(s.slice(0, -1).replace(",", ".")) * 1e3;
}
function forceReflow(el) {
  const targetDocument = el ? el.ownerDocument : document;
  return targetDocument.body.offsetHeight;
}
function patchClass(el, value, isSVG) {
  const transitionClasses = el[vtcKey];
  if (transitionClasses) {
    value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
  }
  if (value == null) {
    el.removeAttribute("class");
  } else if (isSVG) {
    el.setAttribute("class", value);
  } else {
    el.className = value;
  }
}
const vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
const vShowHidden = /* @__PURE__ */ Symbol("_vsh");
const CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
const displayRE = /(?:^|;)\s*display\s*:/;
function patchStyle(el, prev, next) {
  const style = el.style;
  const isCssString = isString(next);
  let hasControlledDisplay = false;
  if (next && !isCssString) {
    if (prev) {
      if (!isString(prev)) {
        for (const key in prev) {
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      } else {
        for (const prevStyle of prev.split(";")) {
          const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      }
    }
    for (const key in next) {
      if (key === "display") {
        hasControlledDisplay = true;
      }
      const value = next[key];
      if (value != null) {
        if (!shouldPreserveTextareaResizeStyle(
          el,
          key,
          !isString(prev) && prev ? prev[key] : void 0,
          value
        )) {
          setStyle(style, key, value);
        }
      } else {
        setStyle(style, key, "");
      }
    }
  } else {
    if (isCssString) {
      if (prev !== next) {
        const cssVarText = style[CSS_VAR_TEXT];
        if (cssVarText) {
          next += ";" + cssVarText;
        }
        style.cssText = next;
        hasControlledDisplay = displayRE.test(next);
      }
    } else if (prev) {
      el.removeAttribute("style");
    }
  }
  if (vShowOriginalDisplay in el) {
    el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
    if (el[vShowHidden]) {
      style.display = "none";
    }
  }
}
const importantRE = /\s*!important$/;
function setStyle(style, name, val) {
  if (isArray$1(val)) {
    val.forEach((v) => setStyle(style, name, v));
  } else {
    if (val == null) val = "";
    if (name.startsWith("--")) {
      if (importantRE.test(val)) {
        style.setProperty(name, val.replace(importantRE, ""), "important");
      } else {
        style.setProperty(name, val);
      }
    } else {
      const prefixed = autoPrefix(style, name);
      if (importantRE.test(val)) {
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ""),
          "important"
        );
      } else {
        style[prefixed] = val;
      }
    }
  }
}
const prefixes = ["Webkit", "Moz", "ms"];
const prefixCache = {};
function autoPrefix(style, rawName) {
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }
  let name = camelize(rawName);
  if (name !== "filter" && name in style) {
    return prefixCache[rawName] = name;
  }
  name = capitalize(name);
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name;
    if (prefixed in style) {
      return prefixCache[rawName] = prefixed;
    }
  }
  return rawName;
}
function shouldPreserveTextareaResizeStyle(el, key, prev, next) {
  return el.tagName === "TEXTAREA" && (key === "width" || key === "height") && isString(next) && prev === next;
}
const xlinkNS = "http://www.w3.org/1999/xlink";
function patchAttr(el, key, value, isSVG, instance, isBoolean = isSpecialBooleanAttr(key)) {
  if (isSVG && key.startsWith("xlink:")) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    if (value == null || isBoolean && !includeBooleanAttr(value)) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(
        key,
        isBoolean ? "" : isSymbol(value) ? String(value) : value
      );
    }
  }
}
function patchDOMProp(el, key, value, parentComponent, attrName) {
  if (key === "innerHTML" || key === "textContent") {
    if (value != null) {
      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
    }
    return;
  }
  const tag = el.tagName;
  if (key === "value" && tag !== "PROGRESS" && // custom elements may use _value internally
  !tag.includes("-")) {
    const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
    const newValue = value == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      el.type === "checkbox" ? "on" : ""
    ) : String(value);
    if (oldValue !== newValue || !("_value" in el)) {
      el.value = newValue;
    }
    if (value == null) {
      el.removeAttribute(key);
    }
    el._value = value;
    return;
  }
  let needRemove = false;
  if (value === "" || value == null) {
    const type = typeof el[key];
    if (type === "boolean") {
      value = includeBooleanAttr(value);
    } else if (value == null && type === "string") {
      value = "";
      needRemove = true;
    } else if (type === "number") {
      value = 0;
      needRemove = true;
    }
  }
  try {
    el[key] = value;
  } catch (e) {
  }
  needRemove && el.removeAttribute(attrName || key);
}
function addEventListener(el, event, handler, options) {
  el.addEventListener(event, handler, options);
}
function removeEventListener(el, event, handler, options) {
  el.removeEventListener(event, handler, options);
}
const veiKey = /* @__PURE__ */ Symbol("_vei");
function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
  const invokers = el[veiKey] || (el[veiKey] = {});
  const existingInvoker = invokers[rawName];
  if (nextValue && existingInvoker) {
    existingInvoker.value = nextValue;
  } else {
    const [name, options] = parseName(rawName);
    if (nextValue) {
      const invoker = invokers[rawName] = createInvoker(
        nextValue,
        instance
      );
      addEventListener(el, name, invoker, options);
    } else if (existingInvoker) {
      removeEventListener(el, name, existingInvoker, options);
      invokers[rawName] = void 0;
    }
  }
}
const optionsModifierRE = /(Once|Passive|Capture)$/;
const optionsModifierEventRE = /^on:?(?:Once|Passive|Capture)$/;
function parseName(name) {
  let options;
  let m;
  while ((m = name.match(optionsModifierRE)) && !optionsModifierEventRE.test(name)) {
    if (!options) options = {};
    name = name.slice(0, name.length - m[1].length);
    options[m[1].toLowerCase()] = true;
  }
  const event = name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2));
  return [event, options];
}
let cachedNow = 0;
const p = /* @__PURE__ */ Promise.resolve();
const getNow = () => cachedNow || (p.then(() => cachedNow = 0), cachedNow = Date.now());
function createInvoker(initialValue, instance) {
  const invoker = (e) => {
    if (!e._vts) {
      e._vts = Date.now();
    } else if (e._vts <= invoker.attached) {
      return;
    }
    const value = invoker.value;
    if (isArray$1(value)) {
      const originalStop = e.stopImmediatePropagation;
      e.stopImmediatePropagation = () => {
        originalStop.call(e);
        e._stopped = true;
      };
      const handlers = value.slice();
      const args = [e];
      for (let i = 0; i < handlers.length; i++) {
        if (e._stopped) {
          break;
        }
        const handler = handlers[i];
        if (handler) {
          callWithAsyncErrorHandling(
            handler,
            instance,
            5,
            args
          );
        }
      }
    } else {
      callWithAsyncErrorHandling(
        value,
        instance,
        5,
        [e]
      );
    }
  };
  invoker.value = initialValue;
  invoker.attached = getNow();
  return invoker;
}
const isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // lowercase letter
key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
const patchProp = (el, key, prevValue, nextValue, namespace, parentComponent) => {
  const isSVG = namespace === "svg";
  if (key === "class") {
    patchClass(el, nextValue, isSVG);
  } else if (key === "style") {
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent);
    }
  } else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
    patchDOMProp(el, key, nextValue);
    if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
    }
  } else if (
    // #11081 force set props for possible async custom element
    el._isVueCE && // #12408 check if it's declared prop or it's async custom element
    (shouldSetAsPropForVueCE(el, key) || // @ts-expect-error _def is private
    el._def.__asyncLoader && (/[A-Z]/.test(key) || !isString(nextValue)))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
  } else {
    if (key === "true-value") {
      el._trueValue = nextValue;
    } else if (key === "false-value") {
      el._falseValue = nextValue;
    }
    patchAttr(el, key, nextValue, isSVG);
  }
};
function shouldSetAsProp(el, key, value, isSVG) {
  if (isSVG) {
    if (key === "innerHTML" || key === "textContent") {
      return true;
    }
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true;
    }
    return false;
  }
  if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") {
    return false;
  }
  if (key === "sandbox" && el.tagName === "IFRAME") {
    return false;
  }
  if (key === "form") {
    return false;
  }
  if (key === "list" && el.tagName === "INPUT") {
    return false;
  }
  if (key === "type" && el.tagName === "TEXTAREA") {
    return false;
  }
  if (key === "width" || key === "height") {
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") {
      return false;
    }
  }
  if (isNativeOn(key) && isString(value)) {
    return false;
  }
  return key in el;
}
function shouldSetAsPropForVueCE(el, key) {
  const props = (
    // @ts-expect-error _def is private
    el._def.props
  );
  if (!props) {
    return false;
  }
  const camelKey = camelize(key);
  return Array.isArray(props) ? props.some((prop) => camelize(prop) === camelKey) : Object.keys(props).some((prop) => camelize(prop) === camelKey);
}
const positionMap = /* @__PURE__ */ new WeakMap();
const newPositionMap = /* @__PURE__ */ new WeakMap();
const moveCbKey = /* @__PURE__ */ Symbol("_moveCb");
const enterCbKey = /* @__PURE__ */ Symbol("_enterCb");
const decorate = (t) => {
  delete t.props.mode;
  return t;
};
const TransitionGroupImpl = /* @__PURE__ */ decorate({
  name: "TransitionGroup",
  props: /* @__PURE__ */ extend({}, TransitionPropsValidators, {
    tag: String,
    moveClass: String
  }),
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    let prevChildren;
    let children;
    onUpdated(() => {
      if (!prevChildren.length) {
        return;
      }
      const moveClass = props.moveClass || `${props.name || "v"}-move`;
      if (!hasCSSTransform(
        prevChildren[0].el,
        instance.vnode.el,
        moveClass
      )) {
        prevChildren = [];
        return;
      }
      prevChildren.forEach(callPendingCbs);
      prevChildren.forEach(recordPosition);
      const movedChildren = prevChildren.filter(applyTranslation);
      forceReflow(instance.vnode.el);
      movedChildren.forEach((c) => {
        const el = c.el;
        const style = el.style;
        addTransitionClass(el, moveClass);
        style.transform = style.webkitTransform = style.transitionDuration = "";
        const cb = el[moveCbKey] = (e) => {
          if (e && e.target !== el) {
            return;
          }
          if (!e || e.propertyName.endsWith("transform")) {
            el.removeEventListener("transitionend", cb);
            el[moveCbKey] = null;
            removeTransitionClass(el, moveClass);
          }
        };
        el.addEventListener("transitionend", cb);
      });
      prevChildren = [];
    });
    return () => {
      const rawProps = toRaw(props);
      const cssTransitionProps = resolveTransitionProps(rawProps);
      let tag = rawProps.tag || Fragment;
      prevChildren = [];
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.el && child.el instanceof Element && // Hidden v-show nodes have no previous layout box to animate from.
          !child.el[vShowHidden]) {
            prevChildren.push(child);
            setTransitionHooks(
              child,
              resolveTransitionHooks(
                child,
                cssTransitionProps,
                state,
                instance
              )
            );
            positionMap.set(child, getPosition(child.el));
          }
        }
      }
      children = slots.default ? getTransitionRawChildren(slots.default()) : [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.key != null) {
          setTransitionHooks(
            child,
            resolveTransitionHooks(child, cssTransitionProps, state, instance)
          );
        }
      }
      return createVNode(tag, null, children);
    };
  }
});
const TransitionGroup = TransitionGroupImpl;
function callPendingCbs(c) {
  const el = c.el;
  if (el[moveCbKey]) {
    el[moveCbKey]();
  }
  if (el[enterCbKey]) {
    el[enterCbKey]();
  }
}
function recordPosition(c) {
  newPositionMap.set(c, getPosition(c.el));
}
function applyTranslation(c) {
  const oldPos = positionMap.get(c);
  const newPos = newPositionMap.get(c);
  const dx = oldPos.left - newPos.left;
  const dy = oldPos.top - newPos.top;
  if (dx || dy) {
    const el = c.el;
    const s = el.style;
    const rect = el.getBoundingClientRect();
    let scaleX = 1;
    let scaleY = 1;
    if (el.offsetWidth) scaleX = rect.width / el.offsetWidth;
    if (el.offsetHeight) scaleY = rect.height / el.offsetHeight;
    if (!Number.isFinite(scaleX) || scaleX === 0) scaleX = 1;
    if (!Number.isFinite(scaleY) || scaleY === 0) scaleY = 1;
    if (Math.abs(scaleX - 1) < 0.01) scaleX = 1;
    if (Math.abs(scaleY - 1) < 0.01) scaleY = 1;
    s.transform = s.webkitTransform = `translate(${dx / scaleX}px,${dy / scaleY}px)`;
    s.transitionDuration = "0s";
    return c;
  }
}
function getPosition(el) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top
  };
}
function hasCSSTransform(el, root, moveClass) {
  const clone = el.cloneNode();
  const _vtc = el[vtcKey];
  if (_vtc) {
    _vtc.forEach((cls) => {
      cls.split(/\s+/).forEach((c) => c && clone.classList.remove(c));
    });
  }
  moveClass.split(/\s+/).forEach((c) => c && clone.classList.add(c));
  clone.style.display = "none";
  const container = root.nodeType === 1 ? root : root.parentNode;
  container.appendChild(clone);
  const { hasTransform } = getTransitionInfo(clone);
  container.removeChild(clone);
  return hasTransform;
}
const systemModifiers = ["ctrl", "shift", "alt", "meta"];
const modifierGuards = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !e.ctrlKey,
  shift: (e) => !e.shiftKey,
  alt: (e) => !e.altKey,
  meta: (e) => !e.metaKey,
  left: (e) => "button" in e && e.button !== 0,
  middle: (e) => "button" in e && e.button !== 1,
  right: (e) => "button" in e && e.button !== 2,
  exact: (e, modifiers) => systemModifiers.some((m) => e[`${m}Key`] && !modifiers.includes(m))
};
const withModifiers = (fn, modifiers) => {
  if (!fn) return fn;
  const cache = fn._withMods || (fn._withMods = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = ((event, ...args) => {
    for (let i = 0; i < modifiers.length; i++) {
      const guard = modifierGuards[modifiers[i]];
      if (guard && guard(event, modifiers)) return;
    }
    return fn(event, ...args);
  }));
};
const rendererOptions = /* @__PURE__ */ extend({ patchProp }, nodeOps);
let renderer;
function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions));
}
const createApp = ((...args) => {
  const app = ensureRenderer().createApp(...args);
  const { mount } = app;
  app.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    const component = app._component;
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML;
    }
    if (container.nodeType === 1) {
      container.textContent = "";
    }
    const proxy = mount(container, false, resolveRootNamespace(container));
    if (container instanceof Element) {
      container.removeAttribute("v-cloak");
      container.setAttribute("data-v-app", "");
    }
    return proxy;
  };
  return app;
});
function resolveRootNamespace(container) {
  if (container instanceof SVGElement) {
    return "svg";
  }
  if (typeof MathMLElement === "function" && container instanceof MathMLElement) {
    return "mathml";
  }
}
function normalizeContainer(container) {
  if (isString(container)) {
    const res = document.querySelector(container);
    return res;
  }
  return container;
}

/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
const isBrowser = typeof document !== "undefined";
function isRouteComponent(component) {
  return typeof component === "object" || "displayName" in component || "props" in component || "__vccOpts" in component;
}
function isESModule(obj) {
  return obj.__esModule || obj[Symbol.toStringTag] === "Module" || obj.default && isRouteComponent(obj.default);
}
const assign = Object.assign;
function applyToParams(fn, params) {
  const newParams = {};
  for (const key in params) {
    const value = params[key];
    newParams[key] = isArray(value) ? value.map(fn) : fn(value);
  }
  return newParams;
}
const noop = () => {
};
const isArray = Array.isArray;
function mergeOptions(defaults, partialOptions) {
  const options = {};
  for (const key in defaults) options[key] = key in partialOptions ? partialOptions[key] : defaults[key];
  return options;
}
const HASH_RE = /#/g;
const AMPERSAND_RE = /&/g;
const SLASH_RE = /\//g;
const EQUAL_RE = /=/g;
const IM_RE = /\?/g;
const PLUS_RE = /\+/g;
const ENC_BRACKET_OPEN_RE = /%5B/g;
const ENC_BRACKET_CLOSE_RE = /%5D/g;
const ENC_CARET_RE = /%5E/g;
const ENC_BACKTICK_RE = /%60/g;
const ENC_CURLY_OPEN_RE = /%7B/g;
const ENC_PIPE_RE = /%7C/g;
const ENC_CURLY_CLOSE_RE = /%7D/g;
const ENC_SPACE_RE = /%20/g;
function commonEncode(text) {
  return text == null ? "" : encodeURI("" + text).replace(ENC_PIPE_RE, "|").replace(ENC_BRACKET_OPEN_RE, "[").replace(ENC_BRACKET_CLOSE_RE, "]");
}
function encodeHash(text) {
  return commonEncode(text).replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
function encodeQueryValue(text) {
  return commonEncode(text).replace(PLUS_RE, "%2B").replace(ENC_SPACE_RE, "+").replace(HASH_RE, "%23").replace(AMPERSAND_RE, "%26").replace(ENC_BACKTICK_RE, "`").replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
function encodeQueryKey(text) {
  return encodeQueryValue(text).replace(EQUAL_RE, "%3D");
}
function encodePath(text) {
  return commonEncode(text).replace(HASH_RE, "%23").replace(IM_RE, "%3F");
}
function encodeParam(text) {
  return encodePath(text).replace(SLASH_RE, "%2F");
}
function decode(text) {
  if (text == null) return null;
  try {
    return decodeURIComponent("" + text);
  } catch (err) {
  }
  return "" + text;
}
const TRAILING_SLASH_RE = /\/$/;
const removeTrailingSlash = (path) => path.replace(TRAILING_SLASH_RE, "");
function parseURL(parseQuery$1, location, currentLocation = "/") {
  let path, query = {}, searchString = "", hash = "";
  const hashPos = location.indexOf("#");
  let searchPos = location.indexOf("?");
  searchPos = hashPos >= 0 && searchPos > hashPos ? -1 : searchPos;
  if (searchPos >= 0) {
    path = location.slice(0, searchPos);
    searchString = location.slice(searchPos, hashPos > 0 ? hashPos : location.length);
    query = parseQuery$1(searchString.slice(1));
  }
  if (hashPos >= 0) {
    path = path || location.slice(0, hashPos);
    hash = location.slice(hashPos, location.length);
  }
  path = resolveRelativePath(path != null ? path : location, currentLocation);
  return {
    fullPath: path + searchString + hash,
    path,
    query,
    hash: decode(hash)
  };
}
function stringifyURL(stringifyQuery$1, location) {
  const query = location.query ? stringifyQuery$1(location.query) : "";
  return location.path + (query && "?") + query + (location.hash || "");
}
function stripBase(pathname, base) {
  if (!base || !pathname.toLowerCase().startsWith(base.toLowerCase())) return pathname;
  return pathname.slice(base.length) || "/";
}
function isSameRouteLocation(stringifyQuery$1, a, b) {
  const aLastIndex = a.matched.length - 1;
  const bLastIndex = b.matched.length - 1;
  return aLastIndex > -1 && aLastIndex === bLastIndex && isSameRouteRecord(a.matched[aLastIndex], b.matched[bLastIndex]) && isSameRouteLocationParams(a.params, b.params) && stringifyQuery$1(a.query) === stringifyQuery$1(b.query) && a.hash === b.hash;
}
function isSameRouteRecord(a, b) {
  return (a.aliasOf || a) === (b.aliasOf || b);
}
function isSameRouteLocationParams(a, b) {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (var key in a) if (!isSameRouteLocationParamsValue(a[key], b[key])) return false;
  return true;
}
function isSameRouteLocationParamsValue(a, b) {
  return isArray(a) ? isEquivalentArray(a, b) : isArray(b) ? isEquivalentArray(b, a) : a?.valueOf() === b?.valueOf();
}
function isEquivalentArray(a, b) {
  return isArray(b) ? a.length === b.length && a.every((value, i) => value === b[i]) : a.length === 1 && a[0] === b;
}
function resolveRelativePath(to, from) {
  if (to.startsWith("/")) return to;
  if (!to) return from;
  const fromSegments = from.split("/");
  const toSegments = to.split("/");
  const lastToSegment = toSegments[toSegments.length - 1];
  if (lastToSegment === ".." || lastToSegment === ".") toSegments.push("");
  let position = fromSegments.length - 1;
  let toPosition;
  let segment;
  for (toPosition = 0; toPosition < toSegments.length; toPosition++) {
    segment = toSegments[toPosition];
    if (segment === ".") continue;
    if (segment === "..") {
      if (position > 1) position--;
    } else break;
  }
  return fromSegments.slice(0, position).join("/") + "/" + toSegments.slice(toPosition).join("/");
}
const START_LOCATION_NORMALIZED = {
  path: "/",
  name: void 0,
  params: {},
  query: {},
  hash: "",
  fullPath: "/",
  matched: [],
  meta: {},
  redirectedFrom: void 0
};
let NavigationType = /* @__PURE__ */ (function(NavigationType$1) {
  NavigationType$1["pop"] = "pop";
  NavigationType$1["push"] = "push";
  return NavigationType$1;
})({});
let NavigationDirection = /* @__PURE__ */ (function(NavigationDirection$1) {
  NavigationDirection$1["back"] = "back";
  NavigationDirection$1["forward"] = "forward";
  NavigationDirection$1["unknown"] = "";
  return NavigationDirection$1;
})({});
function normalizeBase(base) {
  if (!base) if (isBrowser) {
    const baseEl = document.querySelector("base");
    base = baseEl && baseEl.getAttribute("href") || "/";
    base = base.replace(/^\w+:\/\/[^\/]+/, "");
  } else base = "/";
  if (base[0] !== "/" && base[0] !== "#") base = "/" + base;
  return removeTrailingSlash(base);
}
const BEFORE_HASH_RE = /^[^#]+#/;
function createHref(base, location) {
  return base.replace(BEFORE_HASH_RE, "#") + location;
}
function getElementPosition(el, offset) {
  const docRect = document.documentElement.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return {
    behavior: offset.behavior,
    left: elRect.left - docRect.left - (offset.left || 0),
    top: elRect.top - docRect.top - (offset.top || 0)
  };
}
const computeScrollPosition = () => ({
  left: window.scrollX,
  top: window.scrollY
});
function scrollToPosition(position) {
  let scrollToOptions;
  if ("el" in position) {
    const positionEl = position.el;
    const isIdSelector = typeof positionEl === "string" && positionEl.startsWith("#");
    const el = typeof positionEl === "string" ? isIdSelector ? document.getElementById(positionEl.slice(1)) : document.querySelector(positionEl) : positionEl;
    if (!el) {
      return;
    }
    scrollToOptions = getElementPosition(el, position);
  } else scrollToOptions = position;
  if ("scrollBehavior" in document.documentElement.style) window.scrollTo(scrollToOptions);
  else window.scrollTo(scrollToOptions.left != null ? scrollToOptions.left : window.scrollX, scrollToOptions.top != null ? scrollToOptions.top : window.scrollY);
}
function getScrollKey(path, delta) {
  return (history.state ? history.state.position - delta : -1) + path;
}
const scrollPositions = /* @__PURE__ */ new Map();
function saveScrollPosition(key, scrollPosition) {
  scrollPositions.set(key, scrollPosition);
}
function getSavedScrollPosition(key) {
  const scroll = scrollPositions.get(key);
  scrollPositions.delete(key);
  return scroll;
}
function isRouteLocation(route) {
  return typeof route === "string" || route && typeof route === "object";
}
function isRouteName(name) {
  return typeof name === "string" || typeof name === "symbol";
}
let ErrorTypes = /* @__PURE__ */ (function(ErrorTypes$1) {
  ErrorTypes$1[ErrorTypes$1["MATCHER_NOT_FOUND"] = 1] = "MATCHER_NOT_FOUND";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_GUARD_REDIRECT"] = 2] = "NAVIGATION_GUARD_REDIRECT";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_ABORTED"] = 4] = "NAVIGATION_ABORTED";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_CANCELLED"] = 8] = "NAVIGATION_CANCELLED";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_DUPLICATED"] = 16] = "NAVIGATION_DUPLICATED";
  return ErrorTypes$1;
})({});
const NavigationFailureSymbol = Symbol("");
({
  [ErrorTypes.MATCHER_NOT_FOUND]({ location, currentLocation }) {
    return `No match for
 ${JSON.stringify(location)}${currentLocation ? "\nwhile being at\n" + JSON.stringify(currentLocation) : ""}`;
  },
  [ErrorTypes.NAVIGATION_GUARD_REDIRECT]({ from, to }) {
    return `Redirected from "${from.fullPath}" to "${stringifyRoute(to)}" via a navigation guard.`;
  },
  [ErrorTypes.NAVIGATION_ABORTED]({ from, to }) {
    return `Navigation aborted from "${from.fullPath}" to "${to.fullPath}" via a navigation guard.`;
  },
  [ErrorTypes.NAVIGATION_CANCELLED]({ from, to }) {
    return `Navigation cancelled from "${from.fullPath}" to "${to.fullPath}" with a new navigation.`;
  },
  [ErrorTypes.NAVIGATION_DUPLICATED]({ from, to }) {
    return `Avoided redundant navigation to current location: "${from.fullPath}".`;
  }
});
function createRouterError(type, params) {
  return assign(/* @__PURE__ */ new Error(), {
    type,
    [NavigationFailureSymbol]: true
  }, params);
}
function isNavigationFailure(error, type) {
  return error instanceof Error && NavigationFailureSymbol in error && (type == null || !!(error.type & type));
}
const propertiesToLog = [
  "params",
  "query",
  "hash"
];
function stringifyRoute(to) {
  if (typeof to === "string") return to;
  if (to.path != null) return to.path;
  const location = {};
  for (const key of propertiesToLog) if (key in to) location[key] = to[key];
  return JSON.stringify(location, null, 2);
}
function parseQuery(search) {
  const query = {};
  if (search === "" || search === "?") return query;
  const searchParams = (search[0] === "?" ? search.slice(1) : search).split("&");
  for (let i = 0; i < searchParams.length; ++i) {
    const searchParam = searchParams[i].replace(PLUS_RE, " ");
    const eqPos = searchParam.indexOf("=");
    const key = decode(eqPos < 0 ? searchParam : searchParam.slice(0, eqPos));
    const value = eqPos < 0 ? null : decode(searchParam.slice(eqPos + 1));
    if (key in query) {
      let currentValue = query[key];
      if (!isArray(currentValue)) currentValue = query[key] = [currentValue];
      currentValue.push(value);
    } else query[key] = value;
  }
  return query;
}
function stringifyQuery(query) {
  let search = "";
  for (let key in query) {
    const value = query[key];
    key = encodeQueryKey(key);
    if (value == null) {
      if (value !== void 0) search += (search.length ? "&" : "") + key;
      continue;
    }
    (isArray(value) ? value.map((v) => v && encodeQueryValue(v)) : [value && encodeQueryValue(value)]).forEach((value$1) => {
      if (value$1 !== void 0) {
        search += (search.length ? "&" : "") + key;
        if (value$1 != null) search += "=" + value$1;
      }
    });
  }
  return search;
}
function normalizeQuery(query) {
  const normalizedQuery = {};
  for (const key in query) {
    const value = query[key];
    if (value !== void 0) normalizedQuery[key] = isArray(value) ? value.map((v) => v == null ? null : "" + v) : value == null ? value : "" + value;
  }
  return normalizedQuery;
}
const matchedRouteKey = Symbol("");
const viewDepthKey = Symbol("");
const routerKey = Symbol("");
const routeLocationKey = Symbol("");
const routerViewLocationKey = Symbol("");
function useCallbacks() {
  let handlers = [];
  function add(handler) {
    handlers.push(handler);
    return () => {
      const i = handlers.indexOf(handler);
      if (i > -1) handlers.splice(i, 1);
    };
  }
  function reset() {
    handlers = [];
  }
  return {
    add,
    list: () => handlers.slice(),
    reset
  };
}
function guardToPromiseFn(guard, to, from, record, name, runWithContext = (fn) => fn()) {
  const enterCallbackArray = record && (record.enterCallbacks[name] = record.enterCallbacks[name] || []);
  return () => new Promise((resolve, reject) => {
    const next = (valid) => {
      if (valid === false) reject(createRouterError(ErrorTypes.NAVIGATION_ABORTED, {
        from,
        to
      }));
      else if (valid instanceof Error) reject(valid);
      else if (isRouteLocation(valid)) reject(createRouterError(ErrorTypes.NAVIGATION_GUARD_REDIRECT, {
        from: to,
        to: valid
      }));
      else {
        if (enterCallbackArray && record.enterCallbacks[name] === enterCallbackArray && typeof valid === "function") enterCallbackArray.push(valid);
        resolve();
      }
    };
    const guardReturn = runWithContext(() => guard.call(record && record.instances[name], to, from, next));
    let guardCall = Promise.resolve(guardReturn);
    if (guard.length < 3) guardCall = guardCall.then(next);
    guardCall.catch((err) => reject(err));
  });
}
function extractComponentsGuards(matched, guardType, to, from, runWithContext = (fn) => fn()) {
  const guards = [];
  for (const record of matched) {
    for (const name in record.components) {
      let rawComponent = record.components[name];
      if (guardType !== "beforeRouteEnter" && !record.instances[name]) continue;
      if (isRouteComponent(rawComponent)) {
        const guard = (rawComponent.__vccOpts || rawComponent)[guardType];
        guard && guards.push(guardToPromiseFn(guard, to, from, record, name, runWithContext));
      } else {
        let componentPromise = rawComponent();
        guards.push(() => componentPromise.then((resolved) => {
          if (!resolved) throw new Error(`Couldn't resolve component "${name}" at "${record.path}"`);
          const resolvedComponent = isESModule(resolved) ? resolved.default : resolved;
          record.mods[name] = resolved;
          record.components[name] = resolvedComponent;
          const guard = (resolvedComponent.__vccOpts || resolvedComponent)[guardType];
          return guard && guardToPromiseFn(guard, to, from, record, name, runWithContext)();
        }));
      }
    }
  }
  return guards;
}
function extractChangingRecords(to, from) {
  const leavingRecords = [];
  const updatingRecords = [];
  const enteringRecords = [];
  const len = Math.max(from.matched.length, to.matched.length);
  for (let i = 0; i < len; i++) {
    const recordFrom = from.matched[i];
    if (recordFrom) if (to.matched.find((record) => isSameRouteRecord(record, recordFrom))) updatingRecords.push(recordFrom);
    else leavingRecords.push(recordFrom);
    const recordTo = to.matched[i];
    if (recordTo) {
      if (!from.matched.find((record) => isSameRouteRecord(record, recordTo))) enteringRecords.push(recordTo);
    }
  }
  return [
    leavingRecords,
    updatingRecords,
    enteringRecords
  ];
}

/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let createBaseLocation = () => location.protocol + "//" + location.host;
function createCurrentLocation(base, location$1) {
  const { pathname, search, hash } = location$1;
  const hashPos = base.indexOf("#");
  if (hashPos > -1) {
    let slicePos = hash.includes(base.slice(hashPos)) ? base.slice(hashPos).length : 1;
    let pathFromHash = hash.slice(slicePos);
    if (pathFromHash[0] !== "/") pathFromHash = "/" + pathFromHash;
    return stripBase(pathFromHash, "");
  }
  return stripBase(pathname, base) + search + hash;
}
function useHistoryListeners(base, historyState, currentLocation, replace) {
  let listeners = [];
  let teardowns = [];
  let pauseState = null;
  const popStateHandler = ({ state }) => {
    const to = createCurrentLocation(base, location);
    const from = currentLocation.value;
    const fromState = historyState.value;
    let delta = 0;
    if (state) {
      currentLocation.value = to;
      historyState.value = state;
      if (pauseState && pauseState === from) {
        pauseState = null;
        return;
      }
      delta = fromState ? state.position - fromState.position : 0;
    } else replace(to);
    listeners.forEach((listener) => {
      listener(currentLocation.value, from, {
        delta,
        type: NavigationType.pop,
        direction: delta ? delta > 0 ? NavigationDirection.forward : NavigationDirection.back : NavigationDirection.unknown
      });
    });
  };
  function pauseListeners() {
    pauseState = currentLocation.value;
  }
  function listen(callback) {
    listeners.push(callback);
    const teardown = () => {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    };
    teardowns.push(teardown);
    return teardown;
  }
  function beforeUnloadListener() {
    if (document.visibilityState === "hidden") {
      const { history: history$1 } = window;
      if (!history$1.state) return;
      history$1.replaceState(assign({}, history$1.state, { scroll: computeScrollPosition() }), "");
    }
  }
  function destroy() {
    for (const teardown of teardowns) teardown();
    teardowns = [];
    window.removeEventListener("popstate", popStateHandler);
    window.removeEventListener("pagehide", beforeUnloadListener);
    document.removeEventListener("visibilitychange", beforeUnloadListener);
  }
  window.addEventListener("popstate", popStateHandler);
  window.addEventListener("pagehide", beforeUnloadListener);
  document.addEventListener("visibilitychange", beforeUnloadListener);
  return {
    pauseListeners,
    listen,
    destroy
  };
}
function buildState(back, current, forward, replaced = false, computeScroll = false) {
  return {
    back,
    current,
    forward,
    replaced,
    position: window.history.length,
    scroll: computeScroll ? computeScrollPosition() : null
  };
}
function useHistoryStateNavigation(base) {
  const { history: history$1, location: location$1 } = window;
  const currentLocation = { value: createCurrentLocation(base, location$1) };
  const historyState = { value: history$1.state };
  if (!historyState.value) changeLocation(currentLocation.value, {
    back: null,
    current: currentLocation.value,
    forward: null,
    position: history$1.length - 1,
    replaced: true,
    scroll: null
  }, true);
  function changeLocation(to, state, replace$1) {
    const hashIndex = base.indexOf("#");
    const url = hashIndex > -1 ? (location$1.host && document.querySelector("base") ? base : base.slice(hashIndex)) + to : createBaseLocation() + base + to;
    try {
      history$1[replace$1 ? "replaceState" : "pushState"](state, "", url);
      historyState.value = state;
    } catch (err) {
      console.error(err);
      location$1[replace$1 ? "replace" : "assign"](url);
    }
  }
  function replace(to, data) {
    changeLocation(to, assign({}, history$1.state, buildState(historyState.value.back, to, historyState.value.forward, true), data, { position: historyState.value.position }), true);
    currentLocation.value = to;
  }
  function push(to, data) {
    const currentState = assign({}, historyState.value, history$1.state, {
      forward: to,
      scroll: computeScrollPosition()
    });
    changeLocation(currentState.current, currentState, true);
    changeLocation(to, assign({}, buildState(currentLocation.value, to, null), { position: currentState.position + 1 }, data), false);
    currentLocation.value = to;
  }
  return {
    location: currentLocation,
    state: historyState,
    push,
    replace
  };
}
function createWebHistory(base) {
  base = normalizeBase(base);
  const historyNavigation = useHistoryStateNavigation(base);
  const historyListeners = useHistoryListeners(base, historyNavigation.state, historyNavigation.location, historyNavigation.replace);
  function go(delta, triggerListeners = true) {
    if (!triggerListeners) historyListeners.pauseListeners();
    history.go(delta);
  }
  const routerHistory = assign({
    location: "",
    base,
    go,
    createHref: createHref.bind(null, base)
  }, historyNavigation, historyListeners);
  Object.defineProperty(routerHistory, "location", {
    enumerable: true,
    get: () => historyNavigation.location.value
  });
  Object.defineProperty(routerHistory, "state", {
    enumerable: true,
    get: () => historyNavigation.state.value
  });
  return routerHistory;
}
let TokenType = /* @__PURE__ */ (function(TokenType$1) {
  TokenType$1[TokenType$1["Static"] = 0] = "Static";
  TokenType$1[TokenType$1["Param"] = 1] = "Param";
  TokenType$1[TokenType$1["Group"] = 2] = "Group";
  return TokenType$1;
})({});
var TokenizerState = /* @__PURE__ */ (function(TokenizerState$1) {
  TokenizerState$1[TokenizerState$1["Static"] = 0] = "Static";
  TokenizerState$1[TokenizerState$1["Param"] = 1] = "Param";
  TokenizerState$1[TokenizerState$1["ParamRegExp"] = 2] = "ParamRegExp";
  TokenizerState$1[TokenizerState$1["ParamRegExpEnd"] = 3] = "ParamRegExpEnd";
  TokenizerState$1[TokenizerState$1["EscapeNext"] = 4] = "EscapeNext";
  return TokenizerState$1;
})(TokenizerState || {});
const ROOT_TOKEN = {
  type: TokenType.Static,
  value: ""
};
const VALID_PARAM_RE = /[a-zA-Z0-9_]/;
function tokenizePath(path) {
  if (!path) return [[]];
  if (path === "/") return [[ROOT_TOKEN]];
  if (!path.startsWith("/")) throw new Error(`Invalid path "${path}"`);
  function crash(message) {
    throw new Error(`ERR (${state})/"${buffer}": ${message}`);
  }
  let state = TokenizerState.Static;
  let previousState = state;
  const tokens = [];
  let segment;
  function finalizeSegment() {
    if (segment) tokens.push(segment);
    segment = [];
  }
  let i = 0;
  let char;
  let buffer = "";
  let customRe = "";
  function consumeBuffer() {
    if (!buffer) return;
    if (state === TokenizerState.Static) segment.push({
      type: TokenType.Static,
      value: buffer
    });
    else if (state === TokenizerState.Param || state === TokenizerState.ParamRegExp || state === TokenizerState.ParamRegExpEnd) {
      if (segment.length > 1 && (char === "*" || char === "+")) crash(`A repeatable param (${buffer}) must be alone in its segment. eg: '/:ids+.`);
      segment.push({
        type: TokenType.Param,
        value: buffer,
        regexp: customRe,
        repeatable: char === "*" || char === "+",
        optional: char === "*" || char === "?"
      });
    } else crash("Invalid state to consume buffer");
    buffer = "";
  }
  function addCharToBuffer() {
    buffer += char;
  }
  while (i < path.length) {
    char = path[i++];
    if (char === "\\" && state !== TokenizerState.ParamRegExp) {
      previousState = state;
      state = TokenizerState.EscapeNext;
      continue;
    }
    switch (state) {
      case TokenizerState.Static:
        if (char === "/") {
          if (buffer) consumeBuffer();
          finalizeSegment();
        } else if (char === ":") {
          consumeBuffer();
          state = TokenizerState.Param;
        } else addCharToBuffer();
        break;
      case TokenizerState.EscapeNext:
        addCharToBuffer();
        state = previousState;
        break;
      case TokenizerState.Param:
        if (char === "(") state = TokenizerState.ParamRegExp;
        else if (VALID_PARAM_RE.test(char)) addCharToBuffer();
        else {
          consumeBuffer();
          state = TokenizerState.Static;
          if (char !== "*" && char !== "?" && char !== "+") i--;
        }
        break;
      case TokenizerState.ParamRegExp:
        if (char === ")") if (customRe[customRe.length - 1] == "\\") customRe = customRe.slice(0, -1) + char;
        else state = TokenizerState.ParamRegExpEnd;
        else customRe += char;
        break;
      case TokenizerState.ParamRegExpEnd:
        consumeBuffer();
        state = TokenizerState.Static;
        if (char !== "*" && char !== "?" && char !== "+") i--;
        customRe = "";
        break;
      default:
        crash("Unknown state");
        break;
    }
  }
  if (state === TokenizerState.ParamRegExp) crash(`Unfinished custom RegExp for param "${buffer}"`);
  consumeBuffer();
  finalizeSegment();
  return tokens;
}
const BASE_PARAM_PATTERN = "[^/]+?";
const BASE_PATH_PARSER_OPTIONS = {
  sensitive: false,
  strict: false,
  start: true,
  end: true
};
var PathScore = /* @__PURE__ */ (function(PathScore$1) {
  PathScore$1[PathScore$1["_multiplier"] = 10] = "_multiplier";
  PathScore$1[PathScore$1["Root"] = 90] = "Root";
  PathScore$1[PathScore$1["Segment"] = 40] = "Segment";
  PathScore$1[PathScore$1["SubSegment"] = 30] = "SubSegment";
  PathScore$1[PathScore$1["Static"] = 40] = "Static";
  PathScore$1[PathScore$1["Dynamic"] = 20] = "Dynamic";
  PathScore$1[PathScore$1["BonusCustomRegExp"] = 10] = "BonusCustomRegExp";
  PathScore$1[PathScore$1["BonusWildcard"] = -50] = "BonusWildcard";
  PathScore$1[PathScore$1["BonusRepeatable"] = -20] = "BonusRepeatable";
  PathScore$1[PathScore$1["BonusOptional"] = -8] = "BonusOptional";
  PathScore$1[PathScore$1["BonusStrict"] = 0.7000000000000001] = "BonusStrict";
  PathScore$1[PathScore$1["BonusCaseSensitive"] = 0.25] = "BonusCaseSensitive";
  return PathScore$1;
})(PathScore || {});
const REGEX_CHARS_RE = /[.+*?^${}()[\]/\\]/g;
function tokensToParser(segments, extraOptions) {
  const options = assign({}, BASE_PATH_PARSER_OPTIONS, extraOptions);
  const score = [];
  let pattern = options.start ? "^" : "";
  const keys = [];
  for (const segment of segments) {
    const segmentScores = segment.length ? [] : [PathScore.Root];
    if (options.strict && !segment.length) pattern += "/";
    for (let tokenIndex = 0; tokenIndex < segment.length; tokenIndex++) {
      const token = segment[tokenIndex];
      let subSegmentScore = PathScore.Segment + (options.sensitive ? PathScore.BonusCaseSensitive : 0);
      if (token.type === TokenType.Static) {
        if (!tokenIndex) pattern += "/";
        pattern += token.value.replace(REGEX_CHARS_RE, "\\$&");
        subSegmentScore += PathScore.Static;
      } else if (token.type === TokenType.Param) {
        const { value, repeatable, optional, regexp } = token;
        keys.push({
          name: value,
          repeatable,
          optional
        });
        const re$1 = regexp ? regexp : BASE_PARAM_PATTERN;
        if (re$1 !== BASE_PARAM_PATTERN) {
          subSegmentScore += PathScore.BonusCustomRegExp;
          try {
            `${re$1}`;
          } catch (err) {
            throw new Error(`Invalid custom RegExp for param "${value}" (${re$1}): ` + err.message);
          }
        }
        let subPattern = repeatable ? `((?:${re$1})(?:/(?:${re$1}))*)` : `(${re$1})`;
        if (!tokenIndex) subPattern = optional && segment.length < 2 ? `(?:/${subPattern})` : "/" + subPattern;
        if (optional) subPattern += "?";
        pattern += subPattern;
        subSegmentScore += PathScore.Dynamic;
        if (optional) subSegmentScore += PathScore.BonusOptional;
        if (repeatable) subSegmentScore += PathScore.BonusRepeatable;
        if (re$1 === ".*") subSegmentScore += PathScore.BonusWildcard;
      }
      segmentScores.push(subSegmentScore);
    }
    score.push(segmentScores);
  }
  if (options.strict && options.end) {
    const i = score.length - 1;
    score[i][score[i].length - 1] += PathScore.BonusStrict;
  }
  if (!options.strict) pattern += "/?";
  if (options.end) pattern += "$";
  else if (options.strict && !pattern.endsWith("/")) pattern += "(?:/|$)";
  const re = new RegExp(pattern, options.sensitive ? "" : "i");
  function parse(path) {
    const match = path.match(re);
    const params = {};
    if (!match) return null;
    for (let i = 1; i < match.length; i++) {
      const value = match[i] || "";
      const key = keys[i - 1];
      params[key.name] = value && key.repeatable ? value.split("/") : value;
    }
    return params;
  }
  function stringify(params) {
    let path = "";
    let avoidDuplicatedSlash = false;
    for (const segment of segments) {
      if (!avoidDuplicatedSlash || !path.endsWith("/")) path += "/";
      avoidDuplicatedSlash = false;
      for (const token of segment) if (token.type === TokenType.Static) path += token.value;
      else if (token.type === TokenType.Param) {
        const { value, repeatable, optional } = token;
        const param = value in params ? params[value] : "";
        if (isArray(param) && !repeatable) throw new Error(`Provided param "${value}" is an array but it is not repeatable (* or + modifiers)`);
        const text = isArray(param) ? param.join("/") : param;
        if (!text) if (optional) {
          if (segment.length < 2) if (path.endsWith("/")) path = path.slice(0, -1);
          else avoidDuplicatedSlash = true;
        } else throw new Error(`Missing required param "${value}"`);
        path += text;
      }
    }
    return path || "/";
  }
  return {
    re,
    score,
    keys,
    parse,
    stringify
  };
}
function compareScoreArray(a, b) {
  let i = 0;
  while (i < a.length && i < b.length) {
    const diff = b[i] - a[i];
    if (diff) return diff;
    i++;
  }
  if (a.length < b.length) return a.length === 1 && a[0] === PathScore.Static + PathScore.Segment ? -1 : 1;
  else if (a.length > b.length) return b.length === 1 && b[0] === PathScore.Static + PathScore.Segment ? 1 : -1;
  return 0;
}
function comparePathParserScore(a, b) {
  let i = 0;
  const aScore = a.score;
  const bScore = b.score;
  while (i < aScore.length && i < bScore.length) {
    const comp = compareScoreArray(aScore[i], bScore[i]);
    if (comp) return comp;
    i++;
  }
  if (Math.abs(bScore.length - aScore.length) === 1) {
    if (isLastScoreNegative(aScore)) return 1;
    if (isLastScoreNegative(bScore)) return -1;
  }
  return bScore.length - aScore.length;
}
function isLastScoreNegative(score) {
  const last = score[score.length - 1];
  return score.length > 0 && last[last.length - 1] < 0;
}
const PATH_PARSER_OPTIONS_DEFAULTS = {
  strict: false,
  end: true,
  sensitive: false
};
function createRouteRecordMatcher(record, parent, options) {
  const parser = tokensToParser(tokenizePath(record.path), options);
  const matcher = assign(parser, {
    record,
    parent,
    children: [],
    alias: []
  });
  if (parent) {
    if (!matcher.record.aliasOf === !parent.record.aliasOf) parent.children.push(matcher);
  }
  return matcher;
}
function createRouterMatcher(routes, globalOptions) {
  const matchers = [];
  const matcherMap = /* @__PURE__ */ new Map();
  globalOptions = mergeOptions(PATH_PARSER_OPTIONS_DEFAULTS, globalOptions);
  function getRecordMatcher(name) {
    return matcherMap.get(name);
  }
  function addRoute(record, parent, originalRecord) {
    const isRootAdd = !originalRecord;
    const mainNormalizedRecord = normalizeRouteRecord(record);
    mainNormalizedRecord.aliasOf = originalRecord && originalRecord.record;
    const options = mergeOptions(globalOptions, record);
    const normalizedRecords = [mainNormalizedRecord];
    if ("alias" in record) {
      const aliases = typeof record.alias === "string" ? [record.alias] : record.alias;
      for (const alias of aliases) normalizedRecords.push(normalizeRouteRecord(assign({}, mainNormalizedRecord, {
        components: originalRecord ? originalRecord.record.components : mainNormalizedRecord.components,
        path: alias,
        aliasOf: originalRecord ? originalRecord.record : mainNormalizedRecord
      })));
    }
    let matcher;
    let originalMatcher;
    for (const normalizedRecord of normalizedRecords) {
      const { path } = normalizedRecord;
      if (parent && path[0] !== "/") {
        const parentPath = parent.record.path;
        const connectingSlash = parentPath[parentPath.length - 1] === "/" ? "" : "/";
        normalizedRecord.path = parent.record.path + (path && connectingSlash + path);
      }
      matcher = createRouteRecordMatcher(normalizedRecord, parent, options);
      if (originalRecord) {
        originalRecord.alias.push(matcher);
      } else {
        originalMatcher = originalMatcher || matcher;
        if (originalMatcher !== matcher) originalMatcher.alias.push(matcher);
        if (isRootAdd && record.name && !isAliasRecord(matcher)) {
          removeRoute(record.name);
        }
      }
      if (isMatchable(matcher)) insertMatcher(matcher);
      if (mainNormalizedRecord.children) {
        const children = mainNormalizedRecord.children;
        for (let i = 0; i < children.length; i++) addRoute(children[i], matcher, originalRecord && originalRecord.children[i]);
      }
      originalRecord = originalRecord || matcher;
    }
    return originalMatcher ? () => {
      removeRoute(originalMatcher);
    } : noop;
  }
  function removeRoute(matcherRef) {
    if (isRouteName(matcherRef)) {
      const matcher = matcherMap.get(matcherRef);
      if (matcher) {
        matcherMap.delete(matcherRef);
        matchers.splice(matchers.indexOf(matcher), 1);
        matcher.children.forEach(removeRoute);
        matcher.alias.forEach(removeRoute);
      }
    } else {
      const index = matchers.indexOf(matcherRef);
      if (index > -1) {
        matchers.splice(index, 1);
        if (matcherRef.record.name) matcherMap.delete(matcherRef.record.name);
        matcherRef.children.forEach(removeRoute);
        matcherRef.alias.forEach(removeRoute);
      }
    }
  }
  function getRoutes() {
    return matchers;
  }
  function insertMatcher(matcher) {
    const index = findInsertionIndex(matcher, matchers);
    matchers.splice(index, 0, matcher);
    if (matcher.record.name && !isAliasRecord(matcher)) matcherMap.set(matcher.record.name, matcher);
  }
  function resolve(location$1, currentLocation) {
    let matcher;
    let params = {};
    let path;
    let name;
    if ("name" in location$1 && location$1.name) {
      matcher = matcherMap.get(location$1.name);
      if (!matcher) throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, { location: location$1 });
      name = matcher.record.name;
      params = assign(pickParams(currentLocation.params, matcher.keys.filter((k) => !k.optional).concat(matcher.parent ? matcher.parent.keys.filter((k) => k.optional) : []).map((k) => k.name)), location$1.params && pickParams(location$1.params, matcher.keys.map((k) => k.name)));
      path = matcher.stringify(params);
    } else if (location$1.path != null) {
      path = location$1.path;
      matcher = matchers.find((m) => m.re.test(path));
      if (matcher) {
        params = matcher.parse(path);
        name = matcher.record.name;
      }
    } else {
      matcher = currentLocation.name ? matcherMap.get(currentLocation.name) : matchers.find((m) => m.re.test(currentLocation.path));
      if (!matcher) throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, {
        location: location$1,
        currentLocation
      });
      name = matcher.record.name;
      params = assign({}, currentLocation.params, location$1.params);
      path = matcher.stringify(params);
    }
    const matched = [];
    let parentMatcher = matcher;
    while (parentMatcher) {
      matched.unshift(parentMatcher.record);
      parentMatcher = parentMatcher.parent;
    }
    return {
      name,
      path,
      params,
      matched,
      meta: mergeMetaFields(matched)
    };
  }
  routes.forEach((route) => addRoute(route));
  function clearRoutes() {
    matchers.length = 0;
    matcherMap.clear();
  }
  return {
    addRoute,
    resolve,
    removeRoute,
    clearRoutes,
    getRoutes,
    getRecordMatcher
  };
}
function pickParams(params, keys) {
  const newParams = {};
  for (const key of keys) if (key in params) newParams[key] = params[key];
  return newParams;
}
function normalizeRouteRecord(record) {
  const normalized = {
    path: record.path,
    redirect: record.redirect,
    name: record.name,
    meta: record.meta || {},
    aliasOf: record.aliasOf,
    beforeEnter: record.beforeEnter,
    props: normalizeRecordProps(record),
    children: record.children || [],
    instances: {},
    leaveGuards: /* @__PURE__ */ new Set(),
    updateGuards: /* @__PURE__ */ new Set(),
    enterCallbacks: {},
    components: "components" in record ? record.components || null : record.component && { default: record.component }
  };
  Object.defineProperty(normalized, "mods", { value: {} });
  return normalized;
}
function normalizeRecordProps(record) {
  const propsObject = {};
  const props = record.props || false;
  if ("component" in record) propsObject.default = props;
  else for (const name in record.components) propsObject[name] = typeof props === "object" ? props[name] : props;
  return propsObject;
}
function isAliasRecord(record) {
  while (record) {
    if (record.record.aliasOf) return true;
    record = record.parent;
  }
  return false;
}
function mergeMetaFields(matched) {
  return matched.reduce((meta, record) => assign(meta, record.meta), {});
}
function findInsertionIndex(matcher, matchers) {
  let lower = 0;
  let upper = matchers.length;
  while (lower !== upper) {
    const mid = lower + upper >> 1;
    if (comparePathParserScore(matcher, matchers[mid]) < 0) upper = mid;
    else lower = mid + 1;
  }
  const insertionAncestor = getInsertionAncestor(matcher);
  if (insertionAncestor) {
    upper = matchers.lastIndexOf(insertionAncestor, upper - 1);
  }
  return upper;
}
function getInsertionAncestor(matcher) {
  let ancestor = matcher;
  while (ancestor = ancestor.parent) if (isMatchable(ancestor) && comparePathParserScore(matcher, ancestor) === 0) return ancestor;
}
function isMatchable({ record }) {
  return !!(record.name || record.components && Object.keys(record.components).length || record.redirect);
}
function useLink(props) {
  const router = inject(routerKey);
  const currentRoute = inject(routeLocationKey);
  const route = computed(() => {
    const to = unref(props.to);
    return router.resolve(to);
  });
  const activeRecordIndex = computed(() => {
    const { matched } = route.value;
    const { length } = matched;
    const routeMatched = matched[length - 1];
    const currentMatched = currentRoute.matched;
    if (!routeMatched || !currentMatched.length) return -1;
    const index = currentMatched.findIndex(isSameRouteRecord.bind(null, routeMatched));
    if (index > -1) return index;
    const parentRecordPath = getOriginalPath(matched[length - 2]);
    return length > 1 && getOriginalPath(routeMatched) === parentRecordPath && currentMatched[currentMatched.length - 1].path !== parentRecordPath ? currentMatched.findIndex(isSameRouteRecord.bind(null, matched[length - 2])) : index;
  });
  const isActive = computed(() => activeRecordIndex.value > -1 && includesParams(currentRoute.params, route.value.params));
  const isExactActive = computed(() => activeRecordIndex.value > -1 && activeRecordIndex.value === currentRoute.matched.length - 1 && isSameRouteLocationParams(currentRoute.params, route.value.params));
  function navigate(e = {}) {
    if (guardEvent(e)) {
      const p = router[unref(props.replace) ? "replace" : "push"](unref(props.to)).catch(noop);
      if (props.viewTransition && typeof document !== "undefined" && "startViewTransition" in document) document.startViewTransition(() => p);
      return p;
    }
    return Promise.resolve();
  }
  return {
    route,
    href: computed(() => route.value.href),
    isActive,
    isExactActive,
    navigate
  };
}
function preferSingleVNode(vnodes) {
  return vnodes.length === 1 ? vnodes[0] : vnodes;
}
const RouterLinkImpl = /* @__PURE__ */ defineComponent({
  name: "RouterLink",
  compatConfig: { MODE: 3 },
  props: {
    to: {
      type: [String, Object],
      required: true
    },
    replace: Boolean,
    activeClass: String,
    exactActiveClass: String,
    custom: Boolean,
    ariaCurrentValue: {
      type: String,
      default: "page"
    },
    viewTransition: Boolean
  },
  useLink,
  setup(props, { slots }) {
    const link = reactive(useLink(props));
    const { options } = inject(routerKey);
    const elClass = computed(() => ({
      [getLinkClass(props.activeClass, options.linkActiveClass, "router-link-active")]: link.isActive,
      [getLinkClass(props.exactActiveClass, options.linkExactActiveClass, "router-link-exact-active")]: link.isExactActive
    }));
    return () => {
      const children = slots.default && preferSingleVNode(slots.default(link));
      return props.custom ? children : h("a", {
        "aria-current": link.isExactActive ? props.ariaCurrentValue : null,
        href: link.href,
        onClick: link.navigate,
        class: elClass.value
      }, children);
    };
  }
});
const RouterLink = RouterLinkImpl;
function guardEvent(e) {
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
  if (e.defaultPrevented) return;
  if (e.button !== void 0 && e.button !== 0) return;
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute("target");
    if (/\b_blank\b/i.test(target)) return;
  }
  if (e.preventDefault) e.preventDefault();
  return true;
}
function includesParams(outer, inner) {
  for (const key in inner) {
    const innerValue = inner[key];
    const outerValue = outer[key];
    if (typeof innerValue === "string") {
      if (innerValue !== outerValue) return false;
    } else if (!isArray(outerValue) || outerValue.length !== innerValue.length || innerValue.some((value, i) => value.valueOf() !== outerValue[i].valueOf())) return false;
  }
  return true;
}
function getOriginalPath(record) {
  return record ? record.aliasOf ? record.aliasOf.path : record.path : "";
}
const getLinkClass = (propClass, globalClass, defaultClass) => propClass != null ? propClass : globalClass != null ? globalClass : defaultClass;
const RouterViewImpl = /* @__PURE__ */ defineComponent({
  name: "RouterView",
  inheritAttrs: false,
  props: {
    name: {
      type: String,
      default: "default"
    },
    route: Object
  },
  compatConfig: { MODE: 3 },
  setup(props, { attrs, slots }) {
    const injectedRoute = inject(routerViewLocationKey);
    const routeToDisplay = computed(() => props.route || injectedRoute.value);
    const injectedDepth = inject(viewDepthKey, 0);
    const depth = computed(() => {
      let initialDepth = unref(injectedDepth);
      const { matched } = routeToDisplay.value;
      let matchedRoute;
      while ((matchedRoute = matched[initialDepth]) && !matchedRoute.components) initialDepth++;
      return initialDepth;
    });
    const matchedRouteRef = computed(() => routeToDisplay.value.matched[depth.value]);
    provide(viewDepthKey, computed(() => depth.value + 1));
    provide(matchedRouteKey, matchedRouteRef);
    provide(routerViewLocationKey, routeToDisplay);
    const viewRef = ref();
    watch(() => [
      viewRef.value,
      matchedRouteRef.value,
      props.name
    ], ([instance, to, name], [oldInstance, from, oldName]) => {
      if (to) {
        to.instances[name] = instance;
        if (from && from !== to && instance && instance === oldInstance) {
          if (!to.leaveGuards.size) to.leaveGuards = from.leaveGuards;
          if (!to.updateGuards.size) to.updateGuards = from.updateGuards;
        }
      }
      if (instance && to && (!from || !isSameRouteRecord(to, from) || !oldInstance)) (to.enterCallbacks[name] || []).forEach((callback) => callback(instance));
    }, { flush: "post" });
    return () => {
      const route = routeToDisplay.value;
      const currentName = props.name;
      const matchedRoute = matchedRouteRef.value;
      const ViewComponent = matchedRoute && matchedRoute.components[currentName];
      if (!ViewComponent) return normalizeSlot(slots.default, {
        Component: ViewComponent,
        route
      });
      const routePropsOption = matchedRoute.props[currentName];
      const routeProps = routePropsOption ? routePropsOption === true ? route.params : typeof routePropsOption === "function" ? routePropsOption(route) : routePropsOption : null;
      const onVnodeUnmounted = (vnode) => {
        if (vnode.component.isUnmounted) matchedRoute.instances[currentName] = null;
      };
      const component = h(ViewComponent, assign({}, routeProps, attrs, {
        onVnodeUnmounted,
        ref: viewRef
      }));
      return normalizeSlot(slots.default, {
        Component: component,
        route
      }) || component;
    };
  }
});
function normalizeSlot(slot, data) {
  if (!slot) return null;
  const slotContent = slot(data);
  return slotContent.length === 1 ? slotContent[0] : slotContent;
}
const RouterView = RouterViewImpl;
function createRouter(options) {
  const matcher = createRouterMatcher(options.routes, options);
  const parseQuery$1 = options.parseQuery || parseQuery;
  const stringifyQuery$1 = options.stringifyQuery || stringifyQuery;
  const routerHistory = options.history;
  const beforeGuards = useCallbacks();
  const beforeResolveGuards = useCallbacks();
  const afterGuards = useCallbacks();
  const currentRoute = shallowRef(START_LOCATION_NORMALIZED);
  let pendingLocation = START_LOCATION_NORMALIZED;
  if (isBrowser && options.scrollBehavior && "scrollRestoration" in history) history.scrollRestoration = "manual";
  const normalizeParams = applyToParams.bind(null, (paramValue) => "" + paramValue);
  const encodeParams = applyToParams.bind(null, encodeParam);
  const decodeParams = applyToParams.bind(null, decode);
  function addRoute(parentOrRoute, route) {
    let parent;
    let record;
    if (isRouteName(parentOrRoute)) {
      parent = matcher.getRecordMatcher(parentOrRoute);
      record = route;
    } else record = parentOrRoute;
    return matcher.addRoute(record, parent);
  }
  function removeRoute(name) {
    const recordMatcher = matcher.getRecordMatcher(name);
    if (recordMatcher) matcher.removeRoute(recordMatcher);
  }
  function getRoutes() {
    return matcher.getRoutes().map((routeMatcher) => routeMatcher.record);
  }
  function hasRoute(name) {
    return !!matcher.getRecordMatcher(name);
  }
  function resolve(rawLocation, currentLocation) {
    currentLocation = assign({}, currentLocation || currentRoute.value);
    if (typeof rawLocation === "string") {
      const locationNormalized = parseURL(parseQuery$1, rawLocation, currentLocation.path);
      const matchedRoute$1 = matcher.resolve({ path: locationNormalized.path }, currentLocation);
      const href$1 = routerHistory.createHref(locationNormalized.fullPath);
      return assign(locationNormalized, matchedRoute$1, {
        params: decodeParams(matchedRoute$1.params),
        hash: decode(locationNormalized.hash),
        redirectedFrom: void 0,
        href: href$1
      });
    }
    let matcherLocation;
    if (rawLocation.path != null) {
      matcherLocation = assign({}, rawLocation, { path: parseURL(parseQuery$1, rawLocation.path, currentLocation.path).path });
    } else {
      const targetParams = assign({}, rawLocation.params);
      for (const key in targetParams) if (targetParams[key] == null) delete targetParams[key];
      matcherLocation = assign({}, rawLocation, { params: encodeParams(targetParams) });
      currentLocation.params = encodeParams(currentLocation.params);
    }
    const matchedRoute = matcher.resolve(matcherLocation, currentLocation);
    const hash = rawLocation.hash || "";
    matchedRoute.params = normalizeParams(decodeParams(matchedRoute.params));
    const fullPath = stringifyURL(stringifyQuery$1, assign({}, rawLocation, {
      hash: encodeHash(hash),
      path: matchedRoute.path
    }));
    const href = routerHistory.createHref(fullPath);
    return assign({
      fullPath,
      hash,
      query: stringifyQuery$1 === stringifyQuery ? normalizeQuery(rawLocation.query) : rawLocation.query || {}
    }, matchedRoute, {
      redirectedFrom: void 0,
      href
    });
  }
  function locationAsObject(to) {
    return typeof to === "string" ? parseURL(parseQuery$1, to, currentRoute.value.path) : assign({}, to);
  }
  function checkCanceledNavigation(to, from) {
    if (pendingLocation !== to) return createRouterError(ErrorTypes.NAVIGATION_CANCELLED, {
      from,
      to
    });
  }
  function push(to) {
    return pushWithRedirect(to);
  }
  function replace(to) {
    return push(assign(locationAsObject(to), { replace: true }));
  }
  function handleRedirectRecord(to, from) {
    const lastMatched = to.matched[to.matched.length - 1];
    if (lastMatched && lastMatched.redirect) {
      const { redirect } = lastMatched;
      let newTargetLocation = typeof redirect === "function" ? redirect(to, from) : redirect;
      if (typeof newTargetLocation === "string") {
        newTargetLocation = newTargetLocation.includes("?") || newTargetLocation.includes("#") ? newTargetLocation = locationAsObject(newTargetLocation) : { path: newTargetLocation };
        newTargetLocation.params = {};
      }
      return assign({
        query: to.query,
        hash: to.hash,
        params: newTargetLocation.path != null ? {} : to.params
      }, newTargetLocation);
    }
  }
  function pushWithRedirect(to, redirectedFrom) {
    const targetLocation = pendingLocation = resolve(to);
    const from = currentRoute.value;
    const data = to.state;
    const force = to.force;
    const replace$1 = to.replace === true;
    const shouldRedirect = handleRedirectRecord(targetLocation, from);
    if (shouldRedirect) return pushWithRedirect(assign(locationAsObject(shouldRedirect), {
      state: typeof shouldRedirect === "object" ? assign({}, data, shouldRedirect.state) : data,
      force,
      replace: replace$1
    }), redirectedFrom || targetLocation);
    const toLocation = targetLocation;
    toLocation.redirectedFrom = redirectedFrom;
    let failure;
    if (!force && isSameRouteLocation(stringifyQuery$1, from, targetLocation)) {
      failure = createRouterError(ErrorTypes.NAVIGATION_DUPLICATED, {
        to: toLocation,
        from
      });
      handleScroll(from, from, true, false);
    }
    return (failure ? Promise.resolve(failure) : navigate(toLocation, from)).catch((error) => isNavigationFailure(error) ? isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT) ? error : markAsReady(error) : triggerError(error, toLocation, from)).then((failure$1) => {
      if (failure$1) {
        if (isNavigationFailure(failure$1, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
          return pushWithRedirect(assign({ replace: replace$1 }, locationAsObject(failure$1.to), {
            state: typeof failure$1.to === "object" ? assign({}, data, failure$1.to.state) : data,
            force
          }), redirectedFrom || toLocation);
        }
      } else failure$1 = finalizeNavigation(toLocation, from, true, replace$1, data);
      triggerAfterEach(toLocation, from, failure$1);
      return failure$1;
    });
  }
  function checkCanceledNavigationAndReject(to, from) {
    const error = checkCanceledNavigation(to, from);
    return error ? Promise.reject(error) : Promise.resolve();
  }
  function runWithContext(fn) {
    const app = installedApps.values().next().value;
    return app && typeof app.runWithContext === "function" ? app.runWithContext(fn) : fn();
  }
  function navigate(to, from) {
    let guards;
    const [leavingRecords, updatingRecords, enteringRecords] = extractChangingRecords(to, from);
    guards = extractComponentsGuards(leavingRecords.reverse(), "beforeRouteLeave", to, from);
    for (const record of leavingRecords) record.leaveGuards.forEach((guard) => {
      guards.push(guardToPromiseFn(guard, to, from));
    });
    const canceledNavigationCheck = checkCanceledNavigationAndReject.bind(null, to, from);
    guards.push(canceledNavigationCheck);
    return runGuardQueue(guards).then(() => {
      guards = [];
      for (const guard of beforeGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = extractComponentsGuards(updatingRecords, "beforeRouteUpdate", to, from);
      for (const record of updatingRecords) record.updateGuards.forEach((guard) => {
        guards.push(guardToPromiseFn(guard, to, from));
      });
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = [];
      for (const record of enteringRecords) if (record.beforeEnter) if (isArray(record.beforeEnter)) for (const beforeEnter of record.beforeEnter) guards.push(guardToPromiseFn(beforeEnter, to, from));
      else guards.push(guardToPromiseFn(record.beforeEnter, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      to.matched.forEach((record) => record.enterCallbacks = {});
      guards = extractComponentsGuards(enteringRecords, "beforeRouteEnter", to, from, runWithContext);
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = [];
      for (const guard of beforeResolveGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).catch((err) => isNavigationFailure(err, ErrorTypes.NAVIGATION_CANCELLED) ? err : Promise.reject(err));
  }
  function triggerAfterEach(to, from, failure) {
    afterGuards.list().forEach((guard) => runWithContext(() => guard(to, from, failure)));
  }
  function finalizeNavigation(toLocation, from, isPush, replace$1, data) {
    const error = checkCanceledNavigation(toLocation, from);
    if (error) return error;
    const isFirstNavigation = from === START_LOCATION_NORMALIZED;
    const state = !isBrowser ? {} : history.state;
    if (isPush) if (replace$1 || isFirstNavigation) routerHistory.replace(toLocation.fullPath, assign({ scroll: isFirstNavigation && state && state.scroll }, data));
    else routerHistory.push(toLocation.fullPath, data);
    currentRoute.value = toLocation;
    handleScroll(toLocation, from, isPush, isFirstNavigation);
    markAsReady();
  }
  let removeHistoryListener;
  function setupListeners() {
    if (removeHistoryListener) return;
    removeHistoryListener = routerHistory.listen((to, _from, info) => {
      if (!router.listening) return;
      const toLocation = resolve(to);
      const shouldRedirect = handleRedirectRecord(toLocation, router.currentRoute.value);
      if (shouldRedirect) {
        pushWithRedirect(assign(shouldRedirect, {
          replace: true,
          force: true
        }), toLocation).catch(noop);
        return;
      }
      pendingLocation = toLocation;
      const from = currentRoute.value;
      if (isBrowser) saveScrollPosition(getScrollKey(from.fullPath, info.delta), computeScrollPosition());
      navigate(toLocation, from).catch((error) => {
        if (isNavigationFailure(error, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_CANCELLED)) return error;
        if (isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
          pushWithRedirect(assign(locationAsObject(error.to), { force: true }), toLocation).then((failure) => {
            if (isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED) && !info.delta && info.type === NavigationType.pop) routerHistory.go(-1, false);
          }).catch(noop);
          return Promise.reject();
        }
        if (info.delta) routerHistory.go(-info.delta, false);
        return triggerError(error, toLocation, from);
      }).then((failure) => {
        failure = failure || finalizeNavigation(toLocation, from, false);
        if (failure) {
          if (info.delta && !isNavigationFailure(failure, ErrorTypes.NAVIGATION_CANCELLED)) routerHistory.go(-info.delta, false);
          else if (info.type === NavigationType.pop && isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED)) routerHistory.go(-1, false);
        }
        triggerAfterEach(toLocation, from, failure);
      }).catch(noop);
    });
  }
  let readyHandlers = useCallbacks();
  let errorListeners = useCallbacks();
  let ready;
  function triggerError(error, to, from) {
    markAsReady(error);
    const list = errorListeners.list();
    if (list.length) list.forEach((handler) => handler(error, to, from));
    else {
      console.error(error);
    }
    return Promise.reject(error);
  }
  function isReady() {
    if (ready && currentRoute.value !== START_LOCATION_NORMALIZED) return Promise.resolve();
    return new Promise((resolve$1, reject) => {
      readyHandlers.add([resolve$1, reject]);
    });
  }
  function markAsReady(err) {
    if (!ready) {
      ready = !err;
      setupListeners();
      readyHandlers.list().forEach(([resolve$1, reject]) => err ? reject(err) : resolve$1());
      readyHandlers.reset();
    }
    return err;
  }
  function handleScroll(to, from, isPush, isFirstNavigation) {
    const { scrollBehavior } = options;
    if (!isBrowser || !scrollBehavior) return Promise.resolve();
    const scrollPosition = !isPush && getSavedScrollPosition(getScrollKey(to.fullPath, 0)) || (isFirstNavigation || !isPush) && history.state && history.state.scroll || null;
    return nextTick().then(() => scrollBehavior(to, from, scrollPosition)).then((position) => position && scrollToPosition(position)).catch((err) => triggerError(err, to, from));
  }
  const go = (delta) => routerHistory.go(delta);
  let started;
  const installedApps = /* @__PURE__ */ new Set();
  const router = {
    currentRoute,
    listening: true,
    addRoute,
    removeRoute,
    clearRoutes: matcher.clearRoutes,
    hasRoute,
    getRoutes,
    resolve,
    options,
    push,
    replace,
    go,
    back: () => go(-1),
    forward: () => go(1),
    beforeEach: beforeGuards.add,
    beforeResolve: beforeResolveGuards.add,
    afterEach: afterGuards.add,
    onError: errorListeners.add,
    isReady,
    install(app) {
      app.component("RouterLink", RouterLink);
      app.component("RouterView", RouterView);
      app.config.globalProperties.$router = router;
      Object.defineProperty(app.config.globalProperties, "$route", {
        enumerable: true,
        get: () => unref(currentRoute)
      });
      if (isBrowser && !started && currentRoute.value === START_LOCATION_NORMALIZED) {
        started = true;
        push(routerHistory.location).catch((err) => {
        });
      }
      const reactiveRoute = {};
      for (const key in START_LOCATION_NORMALIZED) Object.defineProperty(reactiveRoute, key, {
        get: () => currentRoute.value[key],
        enumerable: true
      });
      app.provide(routerKey, router);
      app.provide(routeLocationKey, shallowReactive(reactiveRoute));
      app.provide(routerViewLocationKey, currentRoute);
      const unmountApp = app.unmount;
      installedApps.add(app);
      app.unmount = function() {
        installedApps.delete(app);
        if (installedApps.size < 1) {
          pendingLocation = START_LOCATION_NORMALIZED;
          removeHistoryListener && removeHistoryListener();
          removeHistoryListener = null;
          currentRoute.value = START_LOCATION_NORMALIZED;
          started = false;
          ready = false;
        }
        unmountApp();
      };
    }
  };
  function runGuardQueue(guards) {
    return guards.reduce((promise, guard) => promise.then(() => runWithContext(guard)), Promise.resolve());
  }
  return router;
}
function useRouter() {
  return inject(routerKey);
}
function useRoute(_name) {
  return inject(routeLocationKey);
}

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Icon = ({ size, strokeWidth = 2, absoluteStrokeWidth, color, iconNode, name, class: classes, ...props }, { slots }) => {
  return h(
    "svg",
    {
      ...defaultAttributes,
      width: size || defaultAttributes.width,
      height: size || defaultAttributes.height,
      stroke: color || defaultAttributes.stroke,
      "stroke-width": absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      class: ["lucide", `lucide-${toKebabCase(name ?? "icon")}`],
      ...props
    },
    [...iconNode.map((child) => h(...child)), ...slots.default ? [slots.default()] : []]
  );
};

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const createLucideIcon = (iconName, iconNode) => (props, { slots }) => h(
  Icon,
  {
    ...props,
    iconNode,
    name: iconName
  },
  slots
);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Check = createLucideIcon("CheckIcon", [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const ChevronDown = createLucideIcon("ChevronDownIcon", [
  ["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const CircleCheck = createLucideIcon("CircleCheckIcon", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Copy = createLucideIcon("CopyIcon", [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Download = createLucideIcon("DownloadIcon", [
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["polyline", { points: "7 10 12 15 17 10", key: "2ggqvy" }],
  ["line", { x1: "12", x2: "12", y1: "15", y2: "3", key: "1vk2je" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const EyeOff = createLucideIcon("EyeOffIcon", [
  [
    "path",
    {
      d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
      key: "ct8e1f"
    }
  ],
  ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242", key: "151rxh" }],
  [
    "path",
    {
      d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
      key: "13bj9a"
    }
  ],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Eye = createLucideIcon("EyeIcon", [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      key: "1nclc0"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Info = createLucideIcon("InfoIcon", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const LogOut = createLucideIcon("LogOutIcon", [
  ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", key: "1uf3rs" }],
  ["polyline", { points: "16 17 21 12 16 7", key: "1gabdz" }],
  ["line", { x1: "21", x2: "9", y1: "12", y2: "12", key: "1uyos4" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Menu = createLucideIcon("MenuIcon", [
  ["line", { x1: "4", x2: "20", y1: "12", y2: "12", key: "1e0a9i" }],
  ["line", { x1: "4", x2: "20", y1: "6", y2: "6", key: "1owob3" }],
  ["line", { x1: "4", x2: "20", y1: "18", y2: "18", key: "yk5zj1" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const TriangleAlert = createLucideIcon("TriangleAlertIcon", [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
]);

/**
 * @license lucide-vue-next v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const X = createLucideIcon("XIcon", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]);

const toastState = reactive({ toasts: [] });

let seed = 0;

/**
 * 弹出一条 toast（§6.1）：默认 6 秒自动消失，传 duration 0 表示不自动消失。
 */
function toast(input) {
  const id = ++seed;
  const item = { id, variant: 'default', duration: 6000, ...input };
  toastState.toasts.push(item);
  if (item.duration > 0) {
    window.setTimeout(() => dismissToast(id), item.duration);
  }
  return id
}

function dismissToast(id) {
  const index = toastState.toasts.findIndex((t) => t.id === id);
  if (index >= 0) toastState.toasts.splice(index, 1);
}

const _hoisted_1$n = { class: "pointer-events-none fixed bottom-4 right-4 left-4 z-[100] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm" };
const _hoisted_2$h = { class: "flex-1" };
const _hoisted_3$h = { class: "text-sm font-medium leading-5 text-ink" };
const _hoisted_4$e = {
  key: 0,
  class: "mt-0.5 text-xs leading-4 text-mid-gray"
};
const _hoisted_5$d = ["onClick"];

const _sfc_main$E = {
  __name: 'Toaster',
  setup(__props) {


return (_ctx, _cache) => {
  return (openBlock(), createBlock(Teleport, { to: "body" }, [
    createBaseVNode("div", _hoisted_1$n, [
      createVNode(TransitionGroup, { name: "toast" }, {
        default: withCtx(() => [
          (openBlock(true), createElementBlock(Fragment, null, renderList(unref(toastState).toasts, (t) => {
            return (openBlock(), createElementBlock("div", {
              key: t.id,
              class: "animate-fade-in-up pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-hairline bg-paper p-3.5 shadow-subtle"
            }, [
              (t.variant === 'success')
                ? (openBlock(), createBlock(unref(CircleCheck), {
                    key: 0,
                    class: "size-4 shrink-0 text-ink"
                  }))
                : (t.variant === 'destructive')
                  ? (openBlock(), createBlock(unref(TriangleAlert), {
                      key: 1,
                      class: "size-4 shrink-0 text-ember"
                    }))
                  : (openBlock(), createBlock(unref(Info), {
                      key: 2,
                      class: "size-4 shrink-0 text-ink"
                    })),
              createBaseVNode("div", _hoisted_2$h, [
                createBaseVNode("p", _hoisted_3$h, toDisplayString(t.title), 1),
                (t.description)
                  ? (openBlock(), createElementBlock("p", _hoisted_4$e, toDisplayString(t.description), 1))
                  : createCommentVNode("", true)
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "rounded-2xl p-0.5 text-mid-gray transition-colors hover:text-ink",
                "aria-label": "关闭",
                onClick: $event => (unref(dismissToast)(t.id))
              }, [
                createVNode(unref(X), { class: "size-4" })
              ], 8, _hoisted_5$d)
            ]))
          }), 128))
        ]),
        _: 1
      })
    ])
  ]))
}
}

};

const _sfc_main$D = {
  __name: 'App',
  setup(__props) {


return (_ctx, _cache) => {
  return (openBlock(), createElementBlock(Fragment, null, [
    createVNode(unref(RouterView)),
    createVNode(_sfc_main$E)
  ], 64))
}
}

};

const scriptRel = 'modulepreload';const assetsURL = function(dep) { return "/"+dep };const seen = {};const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (true               && deps && deps.length > 0) {
    let allSettled2 = function(promises) {
      return Promise.all(
        promises.map(
          (p) => Promise.resolve(p).then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
        )
      );
    };
    document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = allSettled2(
      deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};

function r(e){var t,f,n="";if("string"==typeof e||"number"==typeof e)n+=e;else if("object"==typeof e)if(Array.isArray(e)){var o=e.length;for(t=0;t<o;t++)e[t]&&(f=r(e[t]))&&(n&&(n+=" "),n+=f);}else for(f in e)e[f]&&(n&&(n+=" "),n+=f);return n}function clsx(){for(var e,t,f=0,n="",o=arguments.length;f<o;f++)(e=arguments[f])&&(t=r(e))&&(n&&(n+=" "),n+=t);return n}

const falsyToString = (value)=>typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
const cx = clsx;
const cva = (base, config)=>(props)=>{
        var _config_compoundVariants;
        if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
        const { variants, defaultVariants } = config;
        const getVariantClassNames = Object.keys(variants).map((variant)=>{
            const variantProp = props === null || props === void 0 ? void 0 : props[variant];
            const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
            if (variantProp === null) return null;
            const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
            return variants[variant][variantKey];
        });
        const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param)=>{
            let [key, value] = param;
            if (value === undefined) {
                return acc;
            }
            acc[key] = value;
            return acc;
        }, {});
        const getCompoundVariantClassNames = config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param)=>{
            let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
            return Object.entries(compoundVariantOptions).every((param)=>{
                let [key, value] = param;
                return Array.isArray(value) ? value.includes({
                    ...defaultVariants,
                    ...propsWithoutUndefined
                }[key]) : ({
                    ...defaultVariants,
                    ...propsWithoutUndefined
                })[key] === value;
            }) ? [
                ...acc,
                cvClass,
                cvClassName
            ] : acc;
        }, []);
        return cx(base, getVariantClassNames, getCompoundVariantClassNames, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
    };

/**
 * Concatenates two arrays faster than the array spread operator.
 */
const concatArrays = (array1, array2) => {
  // Pre-allocate for better V8 optimization
  const combinedArray = new Array(array1.length + array2.length);
  for (let i = 0; i < array1.length; i++) {
    combinedArray[i] = array1[i];
  }
  for (let i = 0; i < array2.length; i++) {
    combinedArray[array1.length + i] = array2[i];
  }
  return combinedArray;
};

// Factory function ensures consistent object shapes
const createClassValidatorObject = (classGroupId, validator) => ({
  classGroupId,
  validator
});
// Factory ensures consistent ClassPartObject shape
const createClassPartObject = (nextPart = new Map(), validators = null, classGroupId) => ({
  nextPart,
  validators,
  classGroupId
});
const CLASS_PART_SEPARATOR = '-';
const EMPTY_CONFLICTS = [];
// I use two dots here because one dot is used as prefix for class groups in plugins
const ARBITRARY_PROPERTY_PREFIX = 'arbitrary..';
const createClassGroupUtils = config => {
  const classMap = createClassMap(config);
  const {
    conflictingClassGroups,
    conflictingClassGroupModifiers
  } = config;
  const getClassGroupId = className => {
    if (className.startsWith('[') && className.endsWith(']')) {
      return getGroupIdForArbitraryProperty(className);
    }
    const classParts = className.split(CLASS_PART_SEPARATOR);
    // Classes like `-inset-1` produce an empty string as first classPart. We assume that classes for negative values are used correctly and skip it.
    const startIndex = classParts[0] === '' && classParts.length > 1 ? 1 : 0;
    return getGroupRecursive(classParts, startIndex, classMap);
  };
  const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
    if (hasPostfixModifier) {
      const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
      const baseConflicts = conflictingClassGroups[classGroupId];
      if (modifierConflicts) {
        if (baseConflicts) {
          // Merge base conflicts with modifier conflicts
          return concatArrays(baseConflicts, modifierConflicts);
        }
        // Only modifier conflicts
        return modifierConflicts;
      }
      // Fall back to without postfix if no modifier conflicts
      return baseConflicts || EMPTY_CONFLICTS;
    }
    return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
  };
  return {
    getClassGroupId,
    getConflictingClassGroupIds
  };
};
const getGroupRecursive = (classParts, startIndex, classPartObject) => {
  const classPathsLength = classParts.length - startIndex;
  if (classPathsLength === 0) {
    return classPartObject.classGroupId;
  }
  const currentClassPart = classParts[startIndex];
  const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
  if (nextClassPartObject) {
    const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
    if (result) return result;
  }
  const validators = classPartObject.validators;
  if (validators === null) {
    return undefined;
  }
  // Build classRest string efficiently by joining from startIndex onwards
  const classRest = startIndex === 0 ? classParts.join(CLASS_PART_SEPARATOR) : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
  const validatorsLength = validators.length;
  for (let i = 0; i < validatorsLength; i++) {
    const validatorObj = validators[i];
    if (validatorObj.validator(classRest)) {
      return validatorObj.classGroupId;
    }
  }
  return undefined;
};
/**
 * Get the class group ID for an arbitrary property.
 *
 * @param className - The class name to get the group ID for. Is expected to be string starting with `[` and ending with `]`.
 */
const getGroupIdForArbitraryProperty = className => className.slice(1, -1).indexOf(':') === -1 ? undefined : (() => {
  const content = className.slice(1, -1);
  const colonIndex = content.indexOf(':');
  const property = content.slice(0, colonIndex);
  return property ? ARBITRARY_PROPERTY_PREFIX + property : undefined;
})();
/**
 * Exported for testing only
 */
const createClassMap = config => {
  const {
    theme,
    classGroups
  } = config;
  return processClassGroups(classGroups, theme);
};
// Split into separate functions to maintain monomorphic call sites
const processClassGroups = (classGroups, theme) => {
  const classMap = createClassPartObject();
  for (const classGroupId in classGroups) {
    const group = classGroups[classGroupId];
    processClassesRecursively(group, classMap, classGroupId, theme);
  }
  return classMap;
};
const processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
  const len = classGroup.length;
  for (let i = 0; i < len; i++) {
    const classDefinition = classGroup[i];
    processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
  }
};
// Split into separate functions for each type to maintain monomorphic call sites
const processClassDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
  if (typeof classDefinition === 'string') {
    processStringDefinition(classDefinition, classPartObject, classGroupId);
    return;
  }
  if (typeof classDefinition === 'function') {
    processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
    return;
  }
  processObjectDefinition(classDefinition, classPartObject, classGroupId, theme);
};
const processStringDefinition = (classDefinition, classPartObject, classGroupId) => {
  const classPartObjectToEdit = classDefinition === '' ? classPartObject : getPart(classPartObject, classDefinition);
  classPartObjectToEdit.classGroupId = classGroupId;
};
const processFunctionDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
  if (isThemeGetter(classDefinition)) {
    processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
    return;
  }
  if (classPartObject.validators === null) {
    classPartObject.validators = [];
  }
  classPartObject.validators.push(createClassValidatorObject(classGroupId, classDefinition));
};
const processObjectDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
  const entries = Object.entries(classDefinition);
  const len = entries.length;
  for (let i = 0; i < len; i++) {
    const [key, value] = entries[i];
    processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
  }
};
const getPart = (classPartObject, path) => {
  let current = classPartObject;
  const parts = path.split(CLASS_PART_SEPARATOR);
  const len = parts.length;
  for (let i = 0; i < len; i++) {
    const part = parts[i];
    let next = current.nextPart.get(part);
    if (!next) {
      next = createClassPartObject();
      current.nextPart.set(part, next);
    }
    current = next;
  }
  return current;
};
// Type guard maintains monomorphic check
const isThemeGetter = func => 'isThemeGetter' in func && func.isThemeGetter === true;

// LRU cache implementation using plain objects for simplicity
const createLruCache = maxCacheSize => {
  if (maxCacheSize < 1) {
    return {
      get: () => undefined,
      set: () => {}
    };
  }
  let cacheSize = 0;
  let cache = Object.create(null);
  let previousCache = Object.create(null);
  const update = (key, value) => {
    cache[key] = value;
    cacheSize++;
    if (cacheSize > maxCacheSize) {
      cacheSize = 0;
      previousCache = cache;
      cache = Object.create(null);
    }
  };
  return {
    get(key) {
      let value = cache[key];
      if (value !== undefined) {
        return value;
      }
      if ((value = previousCache[key]) !== undefined) {
        update(key, value);
        return value;
      }
    },
    set(key, value) {
      if (key in cache) {
        cache[key] = value;
      } else {
        update(key, value);
      }
    }
  };
};
const IMPORTANT_MODIFIER = '!';
const MODIFIER_SEPARATOR = ':';
const EMPTY_MODIFIERS = [];
// Pre-allocated result object shape for consistency
const createResultObject = (modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition, isExternal) => ({
  modifiers,
  hasImportantModifier,
  baseClassName,
  maybePostfixModifierPosition,
  isExternal
});
const createParseClassName = config => {
  const {
    prefix,
    experimentalParseClassName
  } = config;
  /**
   * Parse class name into parts.
   *
   * Inspired by `splitAtTopLevelOnly` used in Tailwind CSS
   * @see https://github.com/tailwindlabs/tailwindcss/blob/v3.2.2/src/util/splitAtTopLevelOnly.js
   */
  let parseClassName = className => {
    // Use simple array with push for better performance
    const modifiers = [];
    let bracketDepth = 0;
    let parenDepth = 0;
    let modifierStart = 0;
    let postfixModifierPosition;
    const len = className.length;
    for (let index = 0; index < len; index++) {
      const currentCharacter = className[index];
      if (bracketDepth === 0 && parenDepth === 0) {
        if (currentCharacter === MODIFIER_SEPARATOR) {
          modifiers.push(className.slice(modifierStart, index));
          modifierStart = index + 1;
          continue;
        }
        if (currentCharacter === '/') {
          postfixModifierPosition = index;
          continue;
        }
      }
      if (currentCharacter === '[') bracketDepth++;else if (currentCharacter === ']') bracketDepth--;else if (currentCharacter === '(') parenDepth++;else if (currentCharacter === ')') parenDepth--;
    }
    const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.slice(modifierStart);
    // Inline important modifier check
    let baseClassName = baseClassNameWithImportantModifier;
    let hasImportantModifier = false;
    if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
      baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
      hasImportantModifier = true;
    } else if (
    /**
     * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
     * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
     */
    baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)) {
      baseClassName = baseClassNameWithImportantModifier.slice(1);
      hasImportantModifier = true;
    }
    const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : undefined;
    return createResultObject(modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition);
  };
  if (prefix) {
    const fullPrefix = prefix + MODIFIER_SEPARATOR;
    const parseClassNameOriginal = parseClassName;
    parseClassName = className => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.slice(fullPrefix.length)) : createResultObject(EMPTY_MODIFIERS, false, className, undefined, true);
  }
  if (experimentalParseClassName) {
    const parseClassNameOriginal = parseClassName;
    parseClassName = className => experimentalParseClassName({
      className,
      parseClassName: parseClassNameOriginal
    });
  }
  return parseClassName;
};

/**
 * Sorts modifiers according to following schema:
 * - Predefined modifiers are sorted alphabetically
 * - When an arbitrary variant appears, it must be preserved which modifiers are before and after it
 */
const createSortModifiers = config => {
  // Pre-compute weights for all known modifiers for O(1) comparison
  const modifierWeights = new Map();
  // Assign weights to sensitive modifiers (highest priority, but preserve order)
  config.orderSensitiveModifiers.forEach((mod, index) => {
    modifierWeights.set(mod, 1000000 + index); // High weights for sensitive mods
  });
  return modifiers => {
    const result = [];
    let currentSegment = [];
    // Process modifiers in one pass
    for (let i = 0; i < modifiers.length; i++) {
      const modifier = modifiers[i];
      // Check if modifier is sensitive (starts with '[' or in orderSensitiveModifiers)
      const isArbitrary = modifier[0] === '[';
      const isOrderSensitive = modifierWeights.has(modifier);
      if (isArbitrary || isOrderSensitive) {
        // Sort and flush current segment alphabetically
        if (currentSegment.length > 0) {
          currentSegment.sort();
          result.push(...currentSegment);
          currentSegment = [];
        }
        result.push(modifier);
      } else {
        // Regular modifier - add to current segment for batch sorting
        currentSegment.push(modifier);
      }
    }
    // Sort and add any remaining segment items
    if (currentSegment.length > 0) {
      currentSegment.sort();
      result.push(...currentSegment);
    }
    return result;
  };
};
const createConfigUtils = config => ({
  cache: createLruCache(config.cacheSize),
  parseClassName: createParseClassName(config),
  sortModifiers: createSortModifiers(config),
  postfixLookupClassGroupIds: createPostfixLookupClassGroupIds(config),
  ...createClassGroupUtils(config)
});
const createPostfixLookupClassGroupIds = config => {
  const lookup = Object.create(null);
  const classGroupIds = config.postfixLookupClassGroups;
  if (classGroupIds) {
    for (let i = 0; i < classGroupIds.length; i++) {
      lookup[classGroupIds[i]] = true;
    }
  }
  return lookup;
};
const SPLIT_CLASSES_REGEX = /\s+/;
const mergeClassList = (classList, configUtils) => {
  const {
    parseClassName,
    getClassGroupId,
    getConflictingClassGroupIds,
    sortModifiers,
    postfixLookupClassGroupIds
  } = configUtils;
  /**
   * Set of classGroupIds in following format:
   * `{importantModifier}{variantModifiers}{classGroupId}`
   * @example 'float'
   * @example 'hover:focus:bg-color'
   * @example 'md:!pr'
   */
  const classGroupsInConflict = [];
  const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
  let result = '';
  for (let index = classNames.length - 1; index >= 0; index -= 1) {
    const originalClassName = classNames[index];
    const {
      isExternal,
      modifiers,
      hasImportantModifier,
      baseClassName,
      maybePostfixModifierPosition
    } = parseClassName(originalClassName);
    if (isExternal) {
      result = originalClassName + (result.length > 0 ? ' ' + result : result);
      continue;
    }
    let hasPostfixModifier = !!maybePostfixModifierPosition;
    let classGroupId;
    if (hasPostfixModifier) {
      const baseClassNameWithoutPostfix = baseClassName.substring(0, maybePostfixModifierPosition);
      classGroupId = getClassGroupId(baseClassNameWithoutPostfix);
      const classGroupIdWithPostfix = classGroupId && postfixLookupClassGroupIds[classGroupId] ? getClassGroupId(baseClassName) : undefined;
      if (classGroupIdWithPostfix && classGroupIdWithPostfix !== classGroupId) {
        classGroupId = classGroupIdWithPostfix;
        hasPostfixModifier = false;
      }
    } else {
      classGroupId = getClassGroupId(baseClassName);
    }
    if (!classGroupId) {
      if (!hasPostfixModifier) {
        // Not a Tailwind class
        result = originalClassName + (result.length > 0 ? ' ' + result : result);
        continue;
      }
      classGroupId = getClassGroupId(baseClassName);
      if (!classGroupId) {
        // Not a Tailwind class
        result = originalClassName + (result.length > 0 ? ' ' + result : result);
        continue;
      }
      hasPostfixModifier = false;
    }
    // Fast path: skip sorting for empty or single modifier
    const variantModifier = modifiers.length === 0 ? '' : modifiers.length === 1 ? modifiers[0] : sortModifiers(modifiers).join(':');
    const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
    const classId = modifierId + classGroupId;
    if (classGroupsInConflict.indexOf(classId) > -1) {
      // Tailwind class omitted due to conflict
      continue;
    }
    classGroupsInConflict.push(classId);
    const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
    for (let i = 0; i < conflictGroups.length; ++i) {
      const group = conflictGroups[i];
      classGroupsInConflict.push(modifierId + group);
    }
    // Tailwind class not in conflict
    result = originalClassName + (result.length > 0 ? ' ' + result : result);
  }
  return result;
};

/**
 * The code in this file is copied from https://github.com/lukeed/clsx and modified to suit the needs of tailwind-merge better.
 *
 * Specifically:
 * - Runtime code from https://github.com/lukeed/clsx/blob/v1.2.1/src/index.js
 * - TypeScript types from https://github.com/lukeed/clsx/blob/v1.2.1/clsx.d.ts
 *
 * Original code has MIT license: Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)
 */
const twJoin = (...classLists) => {
  let index = 0;
  let argument;
  let resolvedValue;
  let string = '';
  while (index < classLists.length) {
    if (argument = classLists[index++]) {
      if (resolvedValue = toValue(argument)) {
        string && (string += ' ');
        string += resolvedValue;
      }
    }
  }
  return string;
};
const toValue = mix => {
  // Fast path for strings
  if (typeof mix === 'string') {
    return mix;
  }
  let resolvedValue;
  let string = '';
  for (let k = 0; k < mix.length; k++) {
    if (mix[k]) {
      if (resolvedValue = toValue(mix[k])) {
        string && (string += ' ');
        string += resolvedValue;
      }
    }
  }
  return string;
};
const createTailwindMerge = (createConfigFirst, ...createConfigRest) => {
  let configUtils;
  let cacheGet;
  let cacheSet;
  let functionToCall;
  const initTailwindMerge = classList => {
    const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
    configUtils = createConfigUtils(config);
    cacheGet = configUtils.cache.get;
    cacheSet = configUtils.cache.set;
    functionToCall = tailwindMerge;
    return tailwindMerge(classList);
  };
  const tailwindMerge = classList => {
    const cachedResult = cacheGet(classList);
    if (cachedResult) {
      return cachedResult;
    }
    const result = mergeClassList(classList, configUtils);
    cacheSet(classList, result);
    return result;
  };
  functionToCall = initTailwindMerge;
  return (...args) => functionToCall(twJoin(...args));
};
const fallbackThemeArr = [];
const fromTheme = key => {
  const themeGetter = theme => theme[key] || fallbackThemeArr;
  themeGetter.isThemeGetter = true;
  return themeGetter;
};
const arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
const arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
const fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
const tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
const lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
const colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
// Shadow always begins with x and y offset separated by underscore optionally prepended by inset
const shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
const imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
const isFraction = value => fractionRegex.test(value);
const isNumber = value => !!value && !Number.isNaN(Number(value));
const isInteger = value => !!value && Number.isInteger(Number(value));
const isPercent = value => value.endsWith('%') && isNumber(value.slice(0, -1));
const isTshirtSize = value => tshirtUnitRegex.test(value);
const isAny = () => true;
const isLengthOnly = value =>
// `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
// For example, `hsl(0 0% 0%)` would be classified as a length without this check.
// I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
lengthUnitRegex.test(value) && !colorFunctionRegex.test(value);
const isNever = () => false;
const isShadow = value => shadowRegex.test(value);
const isImage = value => imageRegex.test(value);
const isAnyNonArbitrary = value => !isArbitraryValue(value) && !isArbitraryVariable(value);
const isNamedContainerQuery = value => value.startsWith('@container') && (value[10] === '/' && value[11] !== undefined || value[11] === 's' && value[16] !== undefined && value.startsWith('-size/', 10) || value[11] === 'n' && value[18] !== undefined && value.startsWith('-normal/', 10));
const isArbitrarySize = value => getIsArbitraryValue(value, isLabelSize, isNever);
const isArbitraryValue = value => arbitraryValueRegex.test(value);
const isArbitraryLength = value => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
const isArbitraryNumber = value => getIsArbitraryValue(value, isLabelNumber, isNumber);
const isArbitraryWeight = value => getIsArbitraryValue(value, isLabelWeight, isAny);
const isArbitraryFamilyName = value => getIsArbitraryValue(value, isLabelFamilyName, isNever);
const isArbitraryPosition = value => getIsArbitraryValue(value, isLabelPosition, isNever);
const isArbitraryImage = value => getIsArbitraryValue(value, isLabelImage, isImage);
const isArbitraryShadow = value => getIsArbitraryValue(value, isLabelShadow, isShadow);
const isArbitraryVariable = value => arbitraryVariableRegex.test(value);
const isArbitraryVariableLength = value => getIsArbitraryVariable(value, isLabelLength);
const isArbitraryVariableFamilyName = value => getIsArbitraryVariable(value, isLabelFamilyName);
const isArbitraryVariablePosition = value => getIsArbitraryVariable(value, isLabelPosition);
const isArbitraryVariableSize = value => getIsArbitraryVariable(value, isLabelSize);
const isArbitraryVariableImage = value => getIsArbitraryVariable(value, isLabelImage);
const isArbitraryVariableShadow = value => getIsArbitraryVariable(value, isLabelShadow, true);
const isArbitraryVariableWeight = value => getIsArbitraryVariable(value, isLabelWeight, true);
// Helpers
const getIsArbitraryValue = (value, testLabel, testValue) => {
  const result = arbitraryValueRegex.exec(value);
  if (result) {
    if (result[1]) {
      return testLabel(result[1]);
    }
    return testValue(result[2]);
  }
  return false;
};
const getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
  const result = arbitraryVariableRegex.exec(value);
  if (result) {
    if (result[1]) {
      return testLabel(result[1]);
    }
    return shouldMatchNoLabel;
  }
  return false;
};
// Labels
const isLabelPosition = label => label === 'position' || label === 'percentage';
const isLabelImage = label => label === 'image' || label === 'url';
const isLabelSize = label => label === 'length' || label === 'size' || label === 'bg-size';
const isLabelLength = label => label === 'length';
const isLabelNumber = label => label === 'number';
const isLabelFamilyName = label => label === 'family-name';
const isLabelWeight = label => label === 'number' || label === 'weight';
const isLabelShadow = label => label === 'shadow';
const getDefaultConfig = () => {
  /**
   * Theme getters for theme variable namespaces
   * @see https://tailwindcss.com/docs/theme#theme-variable-namespaces
   */
  /***/
  const themeColor = fromTheme('color');
  const themeFont = fromTheme('font');
  const themeText = fromTheme('text');
  const themeFontWeight = fromTheme('font-weight');
  const themeTracking = fromTheme('tracking');
  const themeLeading = fromTheme('leading');
  const themeBreakpoint = fromTheme('breakpoint');
  const themeContainer = fromTheme('container');
  const themeSpacing = fromTheme('spacing');
  const themeRadius = fromTheme('radius');
  const themeShadow = fromTheme('shadow');
  const themeInsetShadow = fromTheme('inset-shadow');
  const themeTextShadow = fromTheme('text-shadow');
  const themeDropShadow = fromTheme('drop-shadow');
  const themeBlur = fromTheme('blur');
  const themePerspective = fromTheme('perspective');
  const themeAspect = fromTheme('aspect');
  const themeEase = fromTheme('ease');
  const themeAnimate = fromTheme('animate');
  /**
   * Helpers to avoid repeating the same scales
   *
   * We use functions that create a new array every time they're called instead of static arrays.
   * This ensures that users who modify any scale by mutating the array (e.g. with `array.push(element)`) don't accidentally mutate arrays in other parts of the config.
   */
  /***/
  const scaleBreak = () => ['auto', 'avoid', 'all', 'avoid-page', 'page', 'left', 'right', 'column'];
  const scalePosition = () => ['center', 'top', 'bottom', 'left', 'right', 'top-left',
  // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
  'left-top', 'top-right',
  // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
  'right-top', 'bottom-right',
  // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
  'right-bottom', 'bottom-left',
  // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
  'left-bottom'];
  const scalePositionWithArbitrary = () => [...scalePosition(), isArbitraryVariable, isArbitraryValue];
  const scaleOverflow = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'];
  const scaleOverscroll = () => ['auto', 'contain', 'none'];
  const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
  const scaleInset = () => [isFraction, 'full', 'auto', ...scaleUnambiguousSpacing()];
  const scaleGridTemplateColsRows = () => [isInteger, 'none', 'subgrid', isArbitraryVariable, isArbitraryValue];
  const scaleGridColRowStartAndEnd = () => ['auto', {
    span: ['full', isInteger, isArbitraryVariable, isArbitraryValue]
  }, isInteger, isArbitraryVariable, isArbitraryValue];
  const scaleGridColRowStartOrEnd = () => [isInteger, 'auto', isArbitraryVariable, isArbitraryValue];
  const scaleGridAutoColsRows = () => ['auto', 'min', 'max', 'fr', isArbitraryVariable, isArbitraryValue];
  const scaleAlignPrimaryAxis = () => ['start', 'end', 'center', 'between', 'around', 'evenly', 'stretch', 'baseline', 'center-safe', 'end-safe'];
  const scaleAlignSecondaryAxis = () => ['start', 'end', 'center', 'stretch', 'center-safe', 'end-safe'];
  const scaleMargin = () => ['auto', ...scaleUnambiguousSpacing()];
  const scaleSizing = () => [isFraction, 'auto', 'full', 'dvw', 'dvh', 'lvw', 'lvh', 'svw', 'svh', 'min', 'max', 'fit', ...scaleUnambiguousSpacing()];
  const scaleSizingInline = () => [isFraction, 'screen', 'full', 'dvw', 'lvw', 'svw', 'min', 'max', 'fit', ...scaleUnambiguousSpacing()];
  const scaleSizingBlock = () => [isFraction, 'screen', 'full', 'lh', 'dvh', 'lvh', 'svh', 'min', 'max', 'fit', ...scaleUnambiguousSpacing()];
  const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
  const scaleBgPosition = () => [...scalePosition(), isArbitraryVariablePosition, isArbitraryPosition, {
    position: [isArbitraryVariable, isArbitraryValue]
  }];
  const scaleBgRepeat = () => ['no-repeat', {
    repeat: ['', 'x', 'y', 'space', 'round']
  }];
  const scaleBgSize = () => ['auto', 'cover', 'contain', isArbitraryVariableSize, isArbitrarySize, {
    size: [isArbitraryVariable, isArbitraryValue]
  }];
  const scaleGradientStopPosition = () => [isPercent, isArbitraryVariableLength, isArbitraryLength];
  const scaleRadius = () => [
  // Deprecated since Tailwind CSS v4.0.0
  '', 'none', 'full', themeRadius, isArbitraryVariable, isArbitraryValue];
  const scaleBorderWidth = () => ['', isNumber, isArbitraryVariableLength, isArbitraryLength];
  const scaleLineStyle = () => ['solid', 'dashed', 'dotted', 'double'];
  const scaleBlendMode = () => ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  const scaleMaskImagePosition = () => [isNumber, isPercent, isArbitraryVariablePosition, isArbitraryPosition];
  const scaleBlur = () => [
  // Deprecated since Tailwind CSS v4.0.0
  '', 'none', themeBlur, isArbitraryVariable, isArbitraryValue];
  const scaleRotate = () => ['none', isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleScale = () => ['none', isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleSkew = () => [isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleTranslate = () => [isFraction, 'full', ...scaleUnambiguousSpacing()];
  return {
    cacheSize: 500,
    theme: {
      animate: ['spin', 'ping', 'pulse', 'bounce'],
      aspect: ['video'],
      blur: [isTshirtSize],
      breakpoint: [isTshirtSize],
      color: [isAny],
      container: [isTshirtSize],
      'drop-shadow': [isTshirtSize],
      ease: ['in', 'out', 'in-out'],
      font: [isAnyNonArbitrary],
      'font-weight': ['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'],
      'inset-shadow': [isTshirtSize],
      leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
      perspective: ['dramatic', 'near', 'normal', 'midrange', 'distant', 'none'],
      radius: [isTshirtSize],
      shadow: [isTshirtSize],
      spacing: ['px', isNumber],
      text: [isTshirtSize],
      'text-shadow': [isTshirtSize],
      tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']
    },
    classGroups: {
      // --------------
      // --- Layout ---
      // --------------
      /**
       * Aspect Ratio
       * @see https://tailwindcss.com/docs/aspect-ratio
       */
      aspect: [{
        aspect: ['auto', 'square', isFraction, isArbitraryValue, isArbitraryVariable, themeAspect]
      }],
      /**
       * Container
       * @see https://tailwindcss.com/docs/container
       * @deprecated since Tailwind CSS v4.0.0
       */
      container: ['container'],
      /**
       * Container Type
       * @see https://tailwindcss.com/docs/responsive-design#container-queries
       */
      'container-type': [{
        '@container': ['', 'normal', 'size', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Container Name
       * @see https://tailwindcss.com/docs/responsive-design#named-containers
       */
      'container-named': [isNamedContainerQuery],
      /**
       * Columns
       * @see https://tailwindcss.com/docs/columns
       */
      columns: [{
        columns: [isNumber, isArbitraryValue, isArbitraryVariable, themeContainer]
      }],
      /**
       * Break After
       * @see https://tailwindcss.com/docs/break-after
       */
      'break-after': [{
        'break-after': scaleBreak()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      'break-before': [{
        'break-before': scaleBreak()
      }],
      /**
       * Break Inside
       * @see https://tailwindcss.com/docs/break-inside
       */
      'break-inside': [{
        'break-inside': ['auto', 'avoid', 'avoid-page', 'avoid-column']
      }],
      /**
       * Box Decoration Break
       * @see https://tailwindcss.com/docs/box-decoration-break
       */
      'box-decoration': [{
        'box-decoration': ['slice', 'clone']
      }],
      /**
       * Box Sizing
       * @see https://tailwindcss.com/docs/box-sizing
       */
      box: [{
        box: ['border', 'content']
      }],
      /**
       * Display
       * @see https://tailwindcss.com/docs/display
       */
      display: ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'table', 'inline-table', 'table-caption', 'table-cell', 'table-column', 'table-column-group', 'table-footer-group', 'table-header-group', 'table-row-group', 'table-row', 'flow-root', 'grid', 'inline-grid', 'contents', 'list-item', 'hidden'],
      /**
       * Screen Reader Only
       * @see https://tailwindcss.com/docs/display#screen-reader-only
       */
      sr: ['sr-only', 'not-sr-only'],
      /**
       * Floats
       * @see https://tailwindcss.com/docs/float
       */
      float: [{
        float: ['right', 'left', 'none', 'start', 'end']
      }],
      /**
       * Clear
       * @see https://tailwindcss.com/docs/clear
       */
      clear: [{
        clear: ['left', 'right', 'both', 'none', 'start', 'end']
      }],
      /**
       * Isolation
       * @see https://tailwindcss.com/docs/isolation
       */
      isolation: ['isolate', 'isolation-auto'],
      /**
       * Object Fit
       * @see https://tailwindcss.com/docs/object-fit
       */
      'object-fit': [{
        object: ['contain', 'cover', 'fill', 'none', 'scale-down']
      }],
      /**
       * Object Position
       * @see https://tailwindcss.com/docs/object-position
       */
      'object-position': [{
        object: scalePositionWithArbitrary()
      }],
      /**
       * Overflow
       * @see https://tailwindcss.com/docs/overflow
       */
      overflow: [{
        overflow: scaleOverflow()
      }],
      /**
       * Overflow X
       * @see https://tailwindcss.com/docs/overflow
       */
      'overflow-x': [{
        'overflow-x': scaleOverflow()
      }],
      /**
       * Overflow Y
       * @see https://tailwindcss.com/docs/overflow
       */
      'overflow-y': [{
        'overflow-y': scaleOverflow()
      }],
      /**
       * Overscroll Behavior
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      overscroll: [{
        overscroll: scaleOverscroll()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      'overscroll-x': [{
        'overscroll-x': scaleOverscroll()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      'overscroll-y': [{
        'overscroll-y': scaleOverscroll()
      }],
      /**
       * Position
       * @see https://tailwindcss.com/docs/position
       */
      position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
      /**
       * Inset
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      inset: [{
        inset: scaleInset()
      }],
      /**
       * Inset Inline
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      'inset-x': [{
        'inset-x': scaleInset()
      }],
      /**
       * Inset Block
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      'inset-y': [{
        'inset-y': scaleInset()
      }],
      /**
       * Inset Inline Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-s` in next major release
       */
      start: [{
        'inset-s': scaleInset(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        start: scaleInset()
      }],
      /**
       * Inset Inline End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-e` in next major release
       */
      end: [{
        'inset-e': scaleInset(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        end: scaleInset()
      }],
      /**
       * Inset Block Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      'inset-bs': [{
        'inset-bs': scaleInset()
      }],
      /**
       * Inset Block End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      'inset-be': [{
        'inset-be': scaleInset()
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: scaleInset()
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: scaleInset()
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: scaleInset()
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: scaleInset()
      }],
      /**
       * Visibility
       * @see https://tailwindcss.com/docs/visibility
       */
      visibility: ['visible', 'invisible', 'collapse'],
      /**
       * Z-Index
       * @see https://tailwindcss.com/docs/z-index
       */
      z: [{
        z: [isInteger, 'auto', isArbitraryVariable, isArbitraryValue]
      }],
      // ------------------------
      // --- Flexbox and Grid ---
      // ------------------------
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: [isFraction, 'full', 'auto', themeContainer, ...scaleUnambiguousSpacing()]
      }],
      /**
       * Flex Direction
       * @see https://tailwindcss.com/docs/flex-direction
       */
      'flex-direction': [{
        flex: ['row', 'row-reverse', 'col', 'col-reverse']
      }],
      /**
       * Flex Wrap
       * @see https://tailwindcss.com/docs/flex-wrap
       */
      'flex-wrap': [{
        flex: ['nowrap', 'wrap', 'wrap-reverse']
      }],
      /**
       * Flex
       * @see https://tailwindcss.com/docs/flex
       */
      flex: [{
        flex: [isNumber, isFraction, 'auto', 'initial', 'none', isArbitraryValue]
      }],
      /**
       * Flex Grow
       * @see https://tailwindcss.com/docs/flex-grow
       */
      grow: [{
        grow: ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Flex Shrink
       * @see https://tailwindcss.com/docs/flex-shrink
       */
      shrink: [{
        shrink: ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Order
       * @see https://tailwindcss.com/docs/order
       */
      order: [{
        order: [isInteger, 'first', 'last', 'none', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      'grid-cols': [{
        'grid-cols': scaleGridTemplateColsRows()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      'col-start-end': [{
        col: scaleGridColRowStartAndEnd()
      }],
      /**
       * Grid Column Start
       * @see https://tailwindcss.com/docs/grid-column
       */
      'col-start': [{
        'col-start': scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      'col-end': [{
        'col-end': scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      'grid-rows': [{
        'grid-rows': scaleGridTemplateColsRows()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      'row-start-end': [{
        row: scaleGridColRowStartAndEnd()
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      'row-start': [{
        'row-start': scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      'row-end': [{
        'row-end': scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Auto Flow
       * @see https://tailwindcss.com/docs/grid-auto-flow
       */
      'grid-flow': [{
        'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense']
      }],
      /**
       * Grid Auto Columns
       * @see https://tailwindcss.com/docs/grid-auto-columns
       */
      'auto-cols': [{
        'auto-cols': scaleGridAutoColsRows()
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      'auto-rows': [{
        'auto-rows': scaleGridAutoColsRows()
      }],
      /**
       * Gap
       * @see https://tailwindcss.com/docs/gap
       */
      gap: [{
        gap: scaleUnambiguousSpacing()
      }],
      /**
       * Gap X
       * @see https://tailwindcss.com/docs/gap
       */
      'gap-x': [{
        'gap-x': scaleUnambiguousSpacing()
      }],
      /**
       * Gap Y
       * @see https://tailwindcss.com/docs/gap
       */
      'gap-y': [{
        'gap-y': scaleUnambiguousSpacing()
      }],
      /**
       * Justify Content
       * @see https://tailwindcss.com/docs/justify-content
       */
      'justify-content': [{
        justify: [...scaleAlignPrimaryAxis(), 'normal']
      }],
      /**
       * Justify Items
       * @see https://tailwindcss.com/docs/justify-items
       */
      'justify-items': [{
        'justify-items': [...scaleAlignSecondaryAxis(), 'normal']
      }],
      /**
       * Justify Self
       * @see https://tailwindcss.com/docs/justify-self
       */
      'justify-self': [{
        'justify-self': ['auto', ...scaleAlignSecondaryAxis()]
      }],
      /**
       * Align Content
       * @see https://tailwindcss.com/docs/align-content
       */
      'align-content': [{
        content: ['normal', ...scaleAlignPrimaryAxis()]
      }],
      /**
       * Align Items
       * @see https://tailwindcss.com/docs/align-items
       */
      'align-items': [{
        items: [...scaleAlignSecondaryAxis(), {
          baseline: ['', 'last']
        }]
      }],
      /**
       * Align Self
       * @see https://tailwindcss.com/docs/align-self
       */
      'align-self': [{
        self: ['auto', ...scaleAlignSecondaryAxis(), {
          baseline: ['', 'last']
        }]
      }],
      /**
       * Place Content
       * @see https://tailwindcss.com/docs/place-content
       */
      'place-content': [{
        'place-content': scaleAlignPrimaryAxis()
      }],
      /**
       * Place Items
       * @see https://tailwindcss.com/docs/place-items
       */
      'place-items': [{
        'place-items': [...scaleAlignSecondaryAxis(), 'baseline']
      }],
      /**
       * Place Self
       * @see https://tailwindcss.com/docs/place-self
       */
      'place-self': [{
        'place-self': ['auto', ...scaleAlignSecondaryAxis()]
      }],
      // Spacing
      /**
       * Padding
       * @see https://tailwindcss.com/docs/padding
       */
      p: [{
        p: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Inline
       * @see https://tailwindcss.com/docs/padding
       */
      px: [{
        px: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Block
       * @see https://tailwindcss.com/docs/padding
       */
      py: [{
        py: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Inline Start
       * @see https://tailwindcss.com/docs/padding
       */
      ps: [{
        ps: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Inline End
       * @see https://tailwindcss.com/docs/padding
       */
      pe: [{
        pe: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Block Start
       * @see https://tailwindcss.com/docs/padding
       */
      pbs: [{
        pbs: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Block End
       * @see https://tailwindcss.com/docs/padding
       */
      pbe: [{
        pbe: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Top
       * @see https://tailwindcss.com/docs/padding
       */
      pt: [{
        pt: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Right
       * @see https://tailwindcss.com/docs/padding
       */
      pr: [{
        pr: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Bottom
       * @see https://tailwindcss.com/docs/padding
       */
      pb: [{
        pb: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Left
       * @see https://tailwindcss.com/docs/padding
       */
      pl: [{
        pl: scaleUnambiguousSpacing()
      }],
      /**
       * Margin
       * @see https://tailwindcss.com/docs/margin
       */
      m: [{
        m: scaleMargin()
      }],
      /**
       * Margin Inline
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: scaleMargin()
      }],
      /**
       * Margin Block
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: scaleMargin()
      }],
      /**
       * Margin Inline Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: scaleMargin()
      }],
      /**
       * Margin Inline End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: scaleMargin()
      }],
      /**
       * Margin Block Start
       * @see https://tailwindcss.com/docs/margin
       */
      mbs: [{
        mbs: scaleMargin()
      }],
      /**
       * Margin Block End
       * @see https://tailwindcss.com/docs/margin
       */
      mbe: [{
        mbe: scaleMargin()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: scaleMargin()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: scaleMargin()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: scaleMargin()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: scaleMargin()
      }],
      /**
       * Space Between X
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      'space-x': [{
        'space-x': scaleUnambiguousSpacing()
      }],
      /**
       * Space Between X Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      'space-x-reverse': ['space-x-reverse'],
      /**
       * Space Between Y
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      'space-y': [{
        'space-y': scaleUnambiguousSpacing()
      }],
      /**
       * Space Between Y Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      'space-y-reverse': ['space-y-reverse'],
      // --------------
      // --- Sizing ---
      // --------------
      /**
       * Size
       * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
       */
      size: [{
        size: scaleSizing()
      }],
      /**
       * Inline Size
       * @see https://tailwindcss.com/docs/width
       */
      'inline-size': [{
        inline: ['auto', ...scaleSizingInline()]
      }],
      /**
       * Min-Inline Size
       * @see https://tailwindcss.com/docs/min-width
       */
      'min-inline-size': [{
        'min-inline': ['auto', ...scaleSizingInline()]
      }],
      /**
       * Max-Inline Size
       * @see https://tailwindcss.com/docs/max-width
       */
      'max-inline-size': [{
        'max-inline': ['none', ...scaleSizingInline()]
      }],
      /**
       * Block Size
       * @see https://tailwindcss.com/docs/height
       */
      'block-size': [{
        block: ['auto', ...scaleSizingBlock()]
      }],
      /**
       * Min-Block Size
       * @see https://tailwindcss.com/docs/min-height
       */
      'min-block-size': [{
        'min-block': ['auto', ...scaleSizingBlock()]
      }],
      /**
       * Max-Block Size
       * @see https://tailwindcss.com/docs/max-height
       */
      'max-block-size': [{
        'max-block': ['none', ...scaleSizingBlock()]
      }],
      /**
       * Width
       * @see https://tailwindcss.com/docs/width
       */
      w: [{
        w: [themeContainer, 'screen', ...scaleSizing()]
      }],
      /**
       * Min-Width
       * @see https://tailwindcss.com/docs/min-width
       */
      'min-w': [{
        'min-w': [themeContainer, 'screen', /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
        'none', ...scaleSizing()]
      }],
      /**
       * Max-Width
       * @see https://tailwindcss.com/docs/max-width
       */
      'max-w': [{
        'max-w': [themeContainer, 'screen', 'none', /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
        'prose', /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
        {
          screen: [themeBreakpoint]
        }, ...scaleSizing()]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: ['screen', 'lh', ...scaleSizing()]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      'min-h': [{
        'min-h': ['screen', 'lh', 'none', ...scaleSizing()]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      'max-h': [{
        'max-h': ['screen', 'lh', ...scaleSizing()]
      }],
      // ------------------
      // --- Typography ---
      // ------------------
      /**
       * Font Size
       * @see https://tailwindcss.com/docs/font-size
       */
      'font-size': [{
        text: ['base', themeText, isArbitraryVariableLength, isArbitraryLength]
      }],
      /**
       * Font Smoothing
       * @see https://tailwindcss.com/docs/font-smoothing
       */
      'font-smoothing': ['antialiased', 'subpixel-antialiased'],
      /**
       * Font Style
       * @see https://tailwindcss.com/docs/font-style
       */
      'font-style': ['italic', 'not-italic'],
      /**
       * Font Weight
       * @see https://tailwindcss.com/docs/font-weight
       */
      'font-weight': [{
        font: [themeFontWeight, isArbitraryVariableWeight, isArbitraryWeight]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      'font-stretch': [{
        'font-stretch': ['ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'normal', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded', isPercent, isArbitraryValue]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      'font-family': [{
        font: [isArbitraryVariableFamilyName, isArbitraryFamilyName, themeFont]
      }],
      /**
       * Font Feature Settings
       * @see https://tailwindcss.com/docs/font-feature-settings
       */
      'font-features': [{
        'font-features': [isArbitraryValue]
      }],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      'fvn-normal': ['normal-nums'],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      'fvn-ordinal': ['ordinal'],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      'fvn-slashed-zero': ['slashed-zero'],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      'fvn-figure': ['lining-nums', 'oldstyle-nums'],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      'fvn-spacing': ['proportional-nums', 'tabular-nums'],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
      /**
       * Letter Spacing
       * @see https://tailwindcss.com/docs/letter-spacing
       */
      tracking: [{
        tracking: [themeTracking, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Line Clamp
       * @see https://tailwindcss.com/docs/line-clamp
       */
      'line-clamp': [{
        'line-clamp': [isNumber, 'none', isArbitraryVariable, isArbitraryNumber]
      }],
      /**
       * Line Height
       * @see https://tailwindcss.com/docs/line-height
       */
      leading: [{
        leading: [/** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
        themeLeading, ...scaleUnambiguousSpacing()]
      }],
      /**
       * List Style Image
       * @see https://tailwindcss.com/docs/list-style-image
       */
      'list-image': [{
        'list-image': ['none', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * List Style Position
       * @see https://tailwindcss.com/docs/list-style-position
       */
      'list-style-position': [{
        list: ['inside', 'outside']
      }],
      /**
       * List Style Type
       * @see https://tailwindcss.com/docs/list-style-type
       */
      'list-style-type': [{
        list: ['disc', 'decimal', 'none', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Text Alignment
       * @see https://tailwindcss.com/docs/text-align
       */
      'text-alignment': [{
        text: ['left', 'center', 'right', 'justify', 'start', 'end']
      }],
      /**
       * Placeholder Color
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://v3.tailwindcss.com/docs/placeholder-color
       */
      'placeholder-color': [{
        placeholder: scaleColor()
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      'text-color': [{
        text: scaleColor()
      }],
      /**
       * Text Decoration
       * @see https://tailwindcss.com/docs/text-decoration
       */
      'text-decoration': ['underline', 'overline', 'line-through', 'no-underline'],
      /**
       * Text Decoration Style
       * @see https://tailwindcss.com/docs/text-decoration-style
       */
      'text-decoration-style': [{
        decoration: [...scaleLineStyle(), 'wavy']
      }],
      /**
       * Text Decoration Thickness
       * @see https://tailwindcss.com/docs/text-decoration-thickness
       */
      'text-decoration-thickness': [{
        decoration: [isNumber, 'from-font', 'auto', isArbitraryVariable, isArbitraryLength]
      }],
      /**
       * Text Decoration Color
       * @see https://tailwindcss.com/docs/text-decoration-color
       */
      'text-decoration-color': [{
        decoration: scaleColor()
      }],
      /**
       * Text Underline Offset
       * @see https://tailwindcss.com/docs/text-underline-offset
       */
      'underline-offset': [{
        'underline-offset': [isNumber, 'auto', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Text Transform
       * @see https://tailwindcss.com/docs/text-transform
       */
      'text-transform': ['uppercase', 'lowercase', 'capitalize', 'normal-case'],
      /**
       * Text Overflow
       * @see https://tailwindcss.com/docs/text-overflow
       */
      'text-overflow': ['truncate', 'text-ellipsis', 'text-clip'],
      /**
       * Text Wrap
       * @see https://tailwindcss.com/docs/text-wrap
       */
      'text-wrap': [{
        text: ['wrap', 'nowrap', 'balance', 'pretty']
      }],
      /**
       * Text Indent
       * @see https://tailwindcss.com/docs/text-indent
       */
      indent: [{
        indent: scaleUnambiguousSpacing()
      }],
      /**
       * Tab Size
       * @see https://tailwindcss.com/docs/tab-size
       */
      'tab-size': [{
        tab: [isInteger, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Vertical Alignment
       * @see https://tailwindcss.com/docs/vertical-align
       */
      'vertical-align': [{
        align: ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Whitespace
       * @see https://tailwindcss.com/docs/whitespace
       */
      whitespace: [{
        whitespace: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces']
      }],
      /**
       * Word Break
       * @see https://tailwindcss.com/docs/word-break
       */
      break: [{
        break: ['normal', 'words', 'all', 'keep']
      }],
      /**
       * Overflow Wrap
       * @see https://tailwindcss.com/docs/overflow-wrap
       */
      wrap: [{
        wrap: ['break-word', 'anywhere', 'normal']
      }],
      /**
       * Hyphens
       * @see https://tailwindcss.com/docs/hyphens
       */
      hyphens: [{
        hyphens: ['none', 'manual', 'auto']
      }],
      /**
       * Content
       * @see https://tailwindcss.com/docs/content
       */
      content: [{
        content: ['none', isArbitraryVariable, isArbitraryValue]
      }],
      // -------------------
      // --- Backgrounds ---
      // -------------------
      /**
       * Background Attachment
       * @see https://tailwindcss.com/docs/background-attachment
       */
      'bg-attachment': [{
        bg: ['fixed', 'local', 'scroll']
      }],
      /**
       * Background Clip
       * @see https://tailwindcss.com/docs/background-clip
       */
      'bg-clip': [{
        'bg-clip': ['border', 'padding', 'content', 'text']
      }],
      /**
       * Background Origin
       * @see https://tailwindcss.com/docs/background-origin
       */
      'bg-origin': [{
        'bg-origin': ['border', 'padding', 'content']
      }],
      /**
       * Background Position
       * @see https://tailwindcss.com/docs/background-position
       */
      'bg-position': [{
        bg: scaleBgPosition()
      }],
      /**
       * Background Repeat
       * @see https://tailwindcss.com/docs/background-repeat
       */
      'bg-repeat': [{
        bg: scaleBgRepeat()
      }],
      /**
       * Background Size
       * @see https://tailwindcss.com/docs/background-size
       */
      'bg-size': [{
        bg: scaleBgSize()
      }],
      /**
       * Background Image
       * @see https://tailwindcss.com/docs/background-image
       */
      'bg-image': [{
        bg: ['none', {
          linear: [{
            to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl']
          }, isInteger, isArbitraryVariable, isArbitraryValue],
          radial: ['', isArbitraryVariable, isArbitraryValue],
          conic: [isInteger, isArbitraryVariable, isArbitraryValue]
        }, isArbitraryVariableImage, isArbitraryImage]
      }],
      /**
       * Background Color
       * @see https://tailwindcss.com/docs/background-color
       */
      'bg-color': [{
        bg: scaleColor()
      }],
      /**
       * Gradient Color Stops From Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      'gradient-from-pos': [{
        from: scaleGradientStopPosition()
      }],
      /**
       * Gradient Color Stops Via Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      'gradient-via-pos': [{
        via: scaleGradientStopPosition()
      }],
      /**
       * Gradient Color Stops To Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      'gradient-to-pos': [{
        to: scaleGradientStopPosition()
      }],
      /**
       * Gradient Color Stops From
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      'gradient-from': [{
        from: scaleColor()
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      'gradient-via': [{
        via: scaleColor()
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      'gradient-to': [{
        to: scaleColor()
      }],
      // ---------------
      // --- Borders ---
      // ---------------
      /**
       * Border Radius
       * @see https://tailwindcss.com/docs/border-radius
       */
      rounded: [{
        rounded: scaleRadius()
      }],
      /**
       * Border Radius Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-s': [{
        'rounded-s': scaleRadius()
      }],
      /**
       * Border Radius End
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-e': [{
        'rounded-e': scaleRadius()
      }],
      /**
       * Border Radius Top
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-t': [{
        'rounded-t': scaleRadius()
      }],
      /**
       * Border Radius Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-r': [{
        'rounded-r': scaleRadius()
      }],
      /**
       * Border Radius Bottom
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-b': [{
        'rounded-b': scaleRadius()
      }],
      /**
       * Border Radius Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-l': [{
        'rounded-l': scaleRadius()
      }],
      /**
       * Border Radius Start Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-ss': [{
        'rounded-ss': scaleRadius()
      }],
      /**
       * Border Radius Start End
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-se': [{
        'rounded-se': scaleRadius()
      }],
      /**
       * Border Radius End End
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-ee': [{
        'rounded-ee': scaleRadius()
      }],
      /**
       * Border Radius End Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-es': [{
        'rounded-es': scaleRadius()
      }],
      /**
       * Border Radius Top Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-tl': [{
        'rounded-tl': scaleRadius()
      }],
      /**
       * Border Radius Top Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-tr': [{
        'rounded-tr': scaleRadius()
      }],
      /**
       * Border Radius Bottom Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-br': [{
        'rounded-br': scaleRadius()
      }],
      /**
       * Border Radius Bottom Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      'rounded-bl': [{
        'rounded-bl': scaleRadius()
      }],
      /**
       * Border Width
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w': [{
        border: scaleBorderWidth()
      }],
      /**
       * Border Width Inline
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-x': [{
        'border-x': scaleBorderWidth()
      }],
      /**
       * Border Width Block
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-y': [{
        'border-y': scaleBorderWidth()
      }],
      /**
       * Border Width Inline Start
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-s': [{
        'border-s': scaleBorderWidth()
      }],
      /**
       * Border Width Inline End
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-e': [{
        'border-e': scaleBorderWidth()
      }],
      /**
       * Border Width Block Start
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-bs': [{
        'border-bs': scaleBorderWidth()
      }],
      /**
       * Border Width Block End
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-be': [{
        'border-be': scaleBorderWidth()
      }],
      /**
       * Border Width Top
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-t': [{
        'border-t': scaleBorderWidth()
      }],
      /**
       * Border Width Right
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-r': [{
        'border-r': scaleBorderWidth()
      }],
      /**
       * Border Width Bottom
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-b': [{
        'border-b': scaleBorderWidth()
      }],
      /**
       * Border Width Left
       * @see https://tailwindcss.com/docs/border-width
       */
      'border-w-l': [{
        'border-l': scaleBorderWidth()
      }],
      /**
       * Divide Width X
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      'divide-x': [{
        'divide-x': scaleBorderWidth()
      }],
      /**
       * Divide Width X Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      'divide-x-reverse': ['divide-x-reverse'],
      /**
       * Divide Width Y
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      'divide-y': [{
        'divide-y': scaleBorderWidth()
      }],
      /**
       * Divide Width Y Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      'divide-y-reverse': ['divide-y-reverse'],
      /**
       * Border Style
       * @see https://tailwindcss.com/docs/border-style
       */
      'border-style': [{
        border: [...scaleLineStyle(), 'hidden', 'none']
      }],
      /**
       * Divide Style
       * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
       */
      'divide-style': [{
        divide: [...scaleLineStyle(), 'hidden', 'none']
      }],
      /**
       * Border Color
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color': [{
        border: scaleColor()
      }],
      /**
       * Border Color Inline
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-x': [{
        'border-x': scaleColor()
      }],
      /**
       * Border Color Block
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-y': [{
        'border-y': scaleColor()
      }],
      /**
       * Border Color Inline Start
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-s': [{
        'border-s': scaleColor()
      }],
      /**
       * Border Color Inline End
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-e': [{
        'border-e': scaleColor()
      }],
      /**
       * Border Color Block Start
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-bs': [{
        'border-bs': scaleColor()
      }],
      /**
       * Border Color Block End
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-be': [{
        'border-be': scaleColor()
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-t': [{
        'border-t': scaleColor()
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-r': [{
        'border-r': scaleColor()
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-b': [{
        'border-b': scaleColor()
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      'border-color-l': [{
        'border-l': scaleColor()
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      'divide-color': [{
        divide: scaleColor()
      }],
      /**
       * Outline Style
       * @see https://tailwindcss.com/docs/outline-style
       */
      'outline-style': [{
        outline: [...scaleLineStyle(), 'none', 'hidden']
      }],
      /**
       * Outline Offset
       * @see https://tailwindcss.com/docs/outline-offset
       */
      'outline-offset': [{
        'outline-offset': [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Outline Width
       * @see https://tailwindcss.com/docs/outline-width
       */
      'outline-w': [{
        outline: ['', isNumber, isArbitraryVariableLength, isArbitraryLength]
      }],
      /**
       * Outline Color
       * @see https://tailwindcss.com/docs/outline-color
       */
      'outline-color': [{
        outline: scaleColor()
      }],
      // ---------------
      // --- Effects ---
      // ---------------
      /**
       * Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow
       */
      shadow: [{
        shadow: [
        // Deprecated since Tailwind CSS v4.0.0
        '', 'none', themeShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      /**
       * Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
       */
      'shadow-color': [{
        shadow: scaleColor()
      }],
      /**
       * Inset Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
       */
      'inset-shadow': [{
        'inset-shadow': ['none', themeInsetShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      /**
       * Inset Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
       */
      'inset-shadow-color': [{
        'inset-shadow': scaleColor()
      }],
      /**
       * Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
       */
      'ring-w': [{
        ring: scaleBorderWidth()
      }],
      /**
       * Ring Width Inset
       * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      'ring-w-inset': ['ring-inset'],
      /**
       * Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
       */
      'ring-color': [{
        ring: scaleColor()
      }],
      /**
       * Ring Offset Width
       * @see https://v3.tailwindcss.com/docs/ring-offset-width
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      'ring-offset-w': [{
        'ring-offset': [isNumber, isArbitraryLength]
      }],
      /**
       * Ring Offset Color
       * @see https://v3.tailwindcss.com/docs/ring-offset-color
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      'ring-offset-color': [{
        'ring-offset': scaleColor()
      }],
      /**
       * Inset Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
       */
      'inset-ring-w': [{
        'inset-ring': scaleBorderWidth()
      }],
      /**
       * Inset Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
       */
      'inset-ring-color': [{
        'inset-ring': scaleColor()
      }],
      /**
       * Text Shadow
       * @see https://tailwindcss.com/docs/text-shadow
       */
      'text-shadow': [{
        'text-shadow': ['none', themeTextShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      /**
       * Text Shadow Color
       * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
       */
      'text-shadow-color': [{
        'text-shadow': scaleColor()
      }],
      /**
       * Opacity
       * @see https://tailwindcss.com/docs/opacity
       */
      opacity: [{
        opacity: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Mix Blend Mode
       * @see https://tailwindcss.com/docs/mix-blend-mode
       */
      'mix-blend': [{
        'mix-blend': [...scaleBlendMode(), 'plus-darker', 'plus-lighter']
      }],
      /**
       * Background Blend Mode
       * @see https://tailwindcss.com/docs/background-blend-mode
       */
      'bg-blend': [{
        'bg-blend': scaleBlendMode()
      }],
      /**
       * Mask Clip
       * @see https://tailwindcss.com/docs/mask-clip
       */
      'mask-clip': [{
        'mask-clip': ['border', 'padding', 'content', 'fill', 'stroke', 'view']
      }, 'mask-no-clip'],
      /**
       * Mask Composite
       * @see https://tailwindcss.com/docs/mask-composite
       */
      'mask-composite': [{
        mask: ['add', 'subtract', 'intersect', 'exclude']
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      'mask-image-linear-pos': [{
        'mask-linear': [isNumber]
      }],
      'mask-image-linear-from-pos': [{
        'mask-linear-from': scaleMaskImagePosition()
      }],
      'mask-image-linear-to-pos': [{
        'mask-linear-to': scaleMaskImagePosition()
      }],
      'mask-image-linear-from-color': [{
        'mask-linear-from': scaleColor()
      }],
      'mask-image-linear-to-color': [{
        'mask-linear-to': scaleColor()
      }],
      'mask-image-t-from-pos': [{
        'mask-t-from': scaleMaskImagePosition()
      }],
      'mask-image-t-to-pos': [{
        'mask-t-to': scaleMaskImagePosition()
      }],
      'mask-image-t-from-color': [{
        'mask-t-from': scaleColor()
      }],
      'mask-image-t-to-color': [{
        'mask-t-to': scaleColor()
      }],
      'mask-image-r-from-pos': [{
        'mask-r-from': scaleMaskImagePosition()
      }],
      'mask-image-r-to-pos': [{
        'mask-r-to': scaleMaskImagePosition()
      }],
      'mask-image-r-from-color': [{
        'mask-r-from': scaleColor()
      }],
      'mask-image-r-to-color': [{
        'mask-r-to': scaleColor()
      }],
      'mask-image-b-from-pos': [{
        'mask-b-from': scaleMaskImagePosition()
      }],
      'mask-image-b-to-pos': [{
        'mask-b-to': scaleMaskImagePosition()
      }],
      'mask-image-b-from-color': [{
        'mask-b-from': scaleColor()
      }],
      'mask-image-b-to-color': [{
        'mask-b-to': scaleColor()
      }],
      'mask-image-l-from-pos': [{
        'mask-l-from': scaleMaskImagePosition()
      }],
      'mask-image-l-to-pos': [{
        'mask-l-to': scaleMaskImagePosition()
      }],
      'mask-image-l-from-color': [{
        'mask-l-from': scaleColor()
      }],
      'mask-image-l-to-color': [{
        'mask-l-to': scaleColor()
      }],
      'mask-image-x-from-pos': [{
        'mask-x-from': scaleMaskImagePosition()
      }],
      'mask-image-x-to-pos': [{
        'mask-x-to': scaleMaskImagePosition()
      }],
      'mask-image-x-from-color': [{
        'mask-x-from': scaleColor()
      }],
      'mask-image-x-to-color': [{
        'mask-x-to': scaleColor()
      }],
      'mask-image-y-from-pos': [{
        'mask-y-from': scaleMaskImagePosition()
      }],
      'mask-image-y-to-pos': [{
        'mask-y-to': scaleMaskImagePosition()
      }],
      'mask-image-y-from-color': [{
        'mask-y-from': scaleColor()
      }],
      'mask-image-y-to-color': [{
        'mask-y-to': scaleColor()
      }],
      'mask-image-radial': [{
        'mask-radial': [isArbitraryVariable, isArbitraryValue]
      }],
      'mask-image-radial-from-pos': [{
        'mask-radial-from': scaleMaskImagePosition()
      }],
      'mask-image-radial-to-pos': [{
        'mask-radial-to': scaleMaskImagePosition()
      }],
      'mask-image-radial-from-color': [{
        'mask-radial-from': scaleColor()
      }],
      'mask-image-radial-to-color': [{
        'mask-radial-to': scaleColor()
      }],
      'mask-image-radial-shape': [{
        'mask-radial': ['circle', 'ellipse']
      }],
      'mask-image-radial-size': [{
        'mask-radial': [{
          closest: ['side', 'corner'],
          farthest: ['side', 'corner']
        }]
      }],
      'mask-image-radial-pos': [{
        'mask-radial-at': scalePosition()
      }],
      'mask-image-conic-pos': [{
        'mask-conic': [isNumber]
      }],
      'mask-image-conic-from-pos': [{
        'mask-conic-from': scaleMaskImagePosition()
      }],
      'mask-image-conic-to-pos': [{
        'mask-conic-to': scaleMaskImagePosition()
      }],
      'mask-image-conic-from-color': [{
        'mask-conic-from': scaleColor()
      }],
      'mask-image-conic-to-color': [{
        'mask-conic-to': scaleColor()
      }],
      /**
       * Mask Mode
       * @see https://tailwindcss.com/docs/mask-mode
       */
      'mask-mode': [{
        mask: ['alpha', 'luminance', 'match']
      }],
      /**
       * Mask Origin
       * @see https://tailwindcss.com/docs/mask-origin
       */
      'mask-origin': [{
        'mask-origin': ['border', 'padding', 'content', 'fill', 'stroke', 'view']
      }],
      /**
       * Mask Position
       * @see https://tailwindcss.com/docs/mask-position
       */
      'mask-position': [{
        mask: scaleBgPosition()
      }],
      /**
       * Mask Repeat
       * @see https://tailwindcss.com/docs/mask-repeat
       */
      'mask-repeat': [{
        mask: scaleBgRepeat()
      }],
      /**
       * Mask Size
       * @see https://tailwindcss.com/docs/mask-size
       */
      'mask-size': [{
        mask: scaleBgSize()
      }],
      /**
       * Mask Type
       * @see https://tailwindcss.com/docs/mask-type
       */
      'mask-type': [{
        'mask-type': ['alpha', 'luminance']
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      'mask-image': [{
        mask: ['none', isArbitraryVariable, isArbitraryValue]
      }],
      // ---------------
      // --- Filters ---
      // ---------------
      /**
       * Filter
       * @see https://tailwindcss.com/docs/filter
       */
      filter: [{
        filter: [
        // Deprecated since Tailwind CSS v3.0.0
        '', 'none', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Blur
       * @see https://tailwindcss.com/docs/blur
       */
      blur: [{
        blur: scaleBlur()
      }],
      /**
       * Brightness
       * @see https://tailwindcss.com/docs/brightness
       */
      brightness: [{
        brightness: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Contrast
       * @see https://tailwindcss.com/docs/contrast
       */
      contrast: [{
        contrast: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Drop Shadow
       * @see https://tailwindcss.com/docs/drop-shadow
       */
      'drop-shadow': [{
        'drop-shadow': [
        // Deprecated since Tailwind CSS v4.0.0
        '', 'none', themeDropShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      /**
       * Drop Shadow Color
       * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
       */
      'drop-shadow-color': [{
        'drop-shadow': scaleColor()
      }],
      /**
       * Grayscale
       * @see https://tailwindcss.com/docs/grayscale
       */
      grayscale: [{
        grayscale: ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Hue Rotate
       * @see https://tailwindcss.com/docs/hue-rotate
       */
      'hue-rotate': [{
        'hue-rotate': [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Invert
       * @see https://tailwindcss.com/docs/invert
       */
      invert: [{
        invert: ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Saturate
       * @see https://tailwindcss.com/docs/saturate
       */
      saturate: [{
        saturate: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Sepia
       * @see https://tailwindcss.com/docs/sepia
       */
      sepia: [{
        sepia: ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Filter
       * @see https://tailwindcss.com/docs/backdrop-filter
       */
      'backdrop-filter': [{
        'backdrop-filter': [
        // Deprecated since Tailwind CSS v3.0.0
        '', 'none', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Blur
       * @see https://tailwindcss.com/docs/backdrop-blur
       */
      'backdrop-blur': [{
        'backdrop-blur': scaleBlur()
      }],
      /**
       * Backdrop Brightness
       * @see https://tailwindcss.com/docs/backdrop-brightness
       */
      'backdrop-brightness': [{
        'backdrop-brightness': [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Contrast
       * @see https://tailwindcss.com/docs/backdrop-contrast
       */
      'backdrop-contrast': [{
        'backdrop-contrast': [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Grayscale
       * @see https://tailwindcss.com/docs/backdrop-grayscale
       */
      'backdrop-grayscale': [{
        'backdrop-grayscale': ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Hue Rotate
       * @see https://tailwindcss.com/docs/backdrop-hue-rotate
       */
      'backdrop-hue-rotate': [{
        'backdrop-hue-rotate': [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Invert
       * @see https://tailwindcss.com/docs/backdrop-invert
       */
      'backdrop-invert': [{
        'backdrop-invert': ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Opacity
       * @see https://tailwindcss.com/docs/backdrop-opacity
       */
      'backdrop-opacity': [{
        'backdrop-opacity': [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Saturate
       * @see https://tailwindcss.com/docs/backdrop-saturate
       */
      'backdrop-saturate': [{
        'backdrop-saturate': [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Sepia
       * @see https://tailwindcss.com/docs/backdrop-sepia
       */
      'backdrop-sepia': [{
        'backdrop-sepia': ['', isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      // --------------
      // --- Tables ---
      // --------------
      /**
       * Border Collapse
       * @see https://tailwindcss.com/docs/border-collapse
       */
      'border-collapse': [{
        border: ['collapse', 'separate']
      }],
      /**
       * Border Spacing
       * @see https://tailwindcss.com/docs/border-spacing
       */
      'border-spacing': [{
        'border-spacing': scaleUnambiguousSpacing()
      }],
      /**
       * Border Spacing X
       * @see https://tailwindcss.com/docs/border-spacing
       */
      'border-spacing-x': [{
        'border-spacing-x': scaleUnambiguousSpacing()
      }],
      /**
       * Border Spacing Y
       * @see https://tailwindcss.com/docs/border-spacing
       */
      'border-spacing-y': [{
        'border-spacing-y': scaleUnambiguousSpacing()
      }],
      /**
       * Table Layout
       * @see https://tailwindcss.com/docs/table-layout
       */
      'table-layout': [{
        table: ['auto', 'fixed']
      }],
      /**
       * Caption Side
       * @see https://tailwindcss.com/docs/caption-side
       */
      caption: [{
        caption: ['top', 'bottom']
      }],
      // ---------------------------------
      // --- Transitions and Animation ---
      // ---------------------------------
      /**
       * Transition Property
       * @see https://tailwindcss.com/docs/transition-property
       */
      transition: [{
        transition: ['', 'all', 'colors', 'opacity', 'shadow', 'transform', 'none', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Transition Behavior
       * @see https://tailwindcss.com/docs/transition-behavior
       */
      'transition-behavior': [{
        transition: ['normal', 'discrete']
      }],
      /**
       * Transition Duration
       * @see https://tailwindcss.com/docs/transition-duration
       */
      duration: [{
        duration: [isNumber, 'initial', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Transition Timing Function
       * @see https://tailwindcss.com/docs/transition-timing-function
       */
      ease: [{
        ease: ['linear', 'initial', themeEase, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Transition Delay
       * @see https://tailwindcss.com/docs/transition-delay
       */
      delay: [{
        delay: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Animation
       * @see https://tailwindcss.com/docs/animation
       */
      animate: [{
        animate: ['none', themeAnimate, isArbitraryVariable, isArbitraryValue]
      }],
      // ------------------
      // --- Transforms ---
      // ------------------
      /**
       * Backface Visibility
       * @see https://tailwindcss.com/docs/backface-visibility
       */
      backface: [{
        backface: ['hidden', 'visible']
      }],
      /**
       * Perspective
       * @see https://tailwindcss.com/docs/perspective
       */
      perspective: [{
        perspective: [themePerspective, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Perspective Origin
       * @see https://tailwindcss.com/docs/perspective-origin
       */
      'perspective-origin': [{
        'perspective-origin': scalePositionWithArbitrary()
      }],
      /**
       * Rotate
       * @see https://tailwindcss.com/docs/rotate
       */
      rotate: [{
        rotate: scaleRotate()
      }],
      /**
       * Rotate X
       * @see https://tailwindcss.com/docs/rotate
       */
      'rotate-x': [{
        'rotate-x': scaleRotate()
      }],
      /**
       * Rotate Y
       * @see https://tailwindcss.com/docs/rotate
       */
      'rotate-y': [{
        'rotate-y': scaleRotate()
      }],
      /**
       * Rotate Z
       * @see https://tailwindcss.com/docs/rotate
       */
      'rotate-z': [{
        'rotate-z': scaleRotate()
      }],
      /**
       * Scale
       * @see https://tailwindcss.com/docs/scale
       */
      scale: [{
        scale: scaleScale()
      }],
      /**
       * Scale X
       * @see https://tailwindcss.com/docs/scale
       */
      'scale-x': [{
        'scale-x': scaleScale()
      }],
      /**
       * Scale Y
       * @see https://tailwindcss.com/docs/scale
       */
      'scale-y': [{
        'scale-y': scaleScale()
      }],
      /**
       * Scale Z
       * @see https://tailwindcss.com/docs/scale
       */
      'scale-z': [{
        'scale-z': scaleScale()
      }],
      /**
       * Scale 3D
       * @see https://tailwindcss.com/docs/scale
       */
      'scale-3d': ['scale-3d'],
      /**
       * Skew
       * @see https://tailwindcss.com/docs/skew
       */
      skew: [{
        skew: scaleSkew()
      }],
      /**
       * Skew X
       * @see https://tailwindcss.com/docs/skew
       */
      'skew-x': [{
        'skew-x': scaleSkew()
      }],
      /**
       * Skew Y
       * @see https://tailwindcss.com/docs/skew
       */
      'skew-y': [{
        'skew-y': scaleSkew()
      }],
      /**
       * Transform
       * @see https://tailwindcss.com/docs/transform
       */
      transform: [{
        transform: [isArbitraryVariable, isArbitraryValue, '', 'none', 'gpu', 'cpu']
      }],
      /**
       * Transform Origin
       * @see https://tailwindcss.com/docs/transform-origin
       */
      'transform-origin': [{
        origin: scalePositionWithArbitrary()
      }],
      /**
       * Transform Style
       * @see https://tailwindcss.com/docs/transform-style
       */
      'transform-style': [{
        transform: ['3d', 'flat']
      }],
      /**
       * Translate
       * @see https://tailwindcss.com/docs/translate
       */
      translate: [{
        translate: scaleTranslate()
      }],
      /**
       * Translate X
       * @see https://tailwindcss.com/docs/translate
       */
      'translate-x': [{
        'translate-x': scaleTranslate()
      }],
      /**
       * Translate Y
       * @see https://tailwindcss.com/docs/translate
       */
      'translate-y': [{
        'translate-y': scaleTranslate()
      }],
      /**
       * Translate Z
       * @see https://tailwindcss.com/docs/translate
       */
      'translate-z': [{
        'translate-z': scaleTranslate()
      }],
      /**
       * Translate None
       * @see https://tailwindcss.com/docs/translate
       */
      'translate-none': ['translate-none'],
      /**
       * Zoom
       * @see https://tailwindcss.com/docs/zoom
       */
      zoom: [{
        zoom: [isInteger, isArbitraryVariable, isArbitraryValue]
      }],
      // ---------------------
      // --- Interactivity ---
      // ---------------------
      /**
       * Accent Color
       * @see https://tailwindcss.com/docs/accent-color
       */
      accent: [{
        accent: scaleColor()
      }],
      /**
       * Appearance
       * @see https://tailwindcss.com/docs/appearance
       */
      appearance: [{
        appearance: ['none', 'auto']
      }],
      /**
       * Caret Color
       * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
       */
      'caret-color': [{
        caret: scaleColor()
      }],
      /**
       * Color Scheme
       * @see https://tailwindcss.com/docs/color-scheme
       */
      'color-scheme': [{
        scheme: ['normal', 'dark', 'light', 'light-dark', 'only-dark', 'only-light']
      }],
      /**
       * Cursor
       * @see https://tailwindcss.com/docs/cursor
       */
      cursor: [{
        cursor: ['auto', 'default', 'pointer', 'wait', 'text', 'move', 'help', 'not-allowed', 'none', 'context-menu', 'progress', 'cell', 'crosshair', 'vertical-text', 'alias', 'copy', 'no-drop', 'grab', 'grabbing', 'all-scroll', 'col-resize', 'row-resize', 'n-resize', 'e-resize', 's-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'zoom-in', 'zoom-out', isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Field Sizing
       * @see https://tailwindcss.com/docs/field-sizing
       */
      'field-sizing': [{
        'field-sizing': ['fixed', 'content']
      }],
      /**
       * Pointer Events
       * @see https://tailwindcss.com/docs/pointer-events
       */
      'pointer-events': [{
        'pointer-events': ['auto', 'none']
      }],
      /**
       * Resize
       * @see https://tailwindcss.com/docs/resize
       */
      resize: [{
        resize: ['none', '', 'y', 'x']
      }],
      /**
       * Scroll Behavior
       * @see https://tailwindcss.com/docs/scroll-behavior
       */
      'scroll-behavior': [{
        scroll: ['auto', 'smooth']
      }],
      /**
       * Scrollbar Thumb Color
       * @see https://tailwindcss.com/docs/scrollbar-color
       */
      'scrollbar-thumb-color': [{
        'scrollbar-thumb': scaleColor()
      }],
      /**
       * Scrollbar Track Color
       * @see https://tailwindcss.com/docs/scrollbar-color
       */
      'scrollbar-track-color': [{
        'scrollbar-track': scaleColor()
      }],
      /**
       * Scrollbar Gutter
       * @see https://tailwindcss.com/docs/scrollbar-gutter
       */
      'scrollbar-gutter': [{
        'scrollbar-gutter': ['auto', 'stable', 'both']
      }],
      /**
       * Scrollbar Width
       * @see https://tailwindcss.com/docs/scrollbar-width
       */
      'scrollbar-w': [{
        scrollbar: ['auto', 'thin', 'none']
      }],
      /**
       * Scroll Margin
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-m': [{
        'scroll-m': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Inline
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-mx': [{
        'scroll-mx': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Block
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-my': [{
        'scroll-my': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Inline Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-ms': [{
        'scroll-ms': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Inline End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-me': [{
        'scroll-me': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Block Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-mbs': [{
        'scroll-mbs': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Block End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-mbe': [{
        'scroll-mbe': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Top
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-mt': [{
        'scroll-mt': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Right
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-mr': [{
        'scroll-mr': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Bottom
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-mb': [{
        'scroll-mb': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Left
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      'scroll-ml': [{
        'scroll-ml': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-p': [{
        'scroll-p': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Inline
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-px': [{
        'scroll-px': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Block
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-py': [{
        'scroll-py': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Inline Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-ps': [{
        'scroll-ps': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Inline End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-pe': [{
        'scroll-pe': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Block Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-pbs': [{
        'scroll-pbs': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Block End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-pbe': [{
        'scroll-pbe': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Top
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-pt': [{
        'scroll-pt': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Right
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-pr': [{
        'scroll-pr': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Bottom
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-pb': [{
        'scroll-pb': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Left
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      'scroll-pl': [{
        'scroll-pl': scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Snap Align
       * @see https://tailwindcss.com/docs/scroll-snap-align
       */
      'snap-align': [{
        snap: ['start', 'end', 'center', 'align-none']
      }],
      /**
       * Scroll Snap Stop
       * @see https://tailwindcss.com/docs/scroll-snap-stop
       */
      'snap-stop': [{
        snap: ['normal', 'always']
      }],
      /**
       * Scroll Snap Type
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      'snap-type': [{
        snap: ['none', 'x', 'y', 'both']
      }],
      /**
       * Scroll Snap Type Strictness
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      'snap-strictness': [{
        snap: ['mandatory', 'proximity']
      }],
      /**
       * Touch Action
       * @see https://tailwindcss.com/docs/touch-action
       */
      touch: [{
        touch: ['auto', 'none', 'manipulation']
      }],
      /**
       * Touch Action X
       * @see https://tailwindcss.com/docs/touch-action
       */
      'touch-x': [{
        'touch-pan': ['x', 'left', 'right']
      }],
      /**
       * Touch Action Y
       * @see https://tailwindcss.com/docs/touch-action
       */
      'touch-y': [{
        'touch-pan': ['y', 'up', 'down']
      }],
      /**
       * Touch Action Pinch Zoom
       * @see https://tailwindcss.com/docs/touch-action
       */
      'touch-pz': ['touch-pinch-zoom'],
      /**
       * User Select
       * @see https://tailwindcss.com/docs/user-select
       */
      select: [{
        select: ['none', 'text', 'all', 'auto']
      }],
      /**
       * Will Change
       * @see https://tailwindcss.com/docs/will-change
       */
      'will-change': [{
        'will-change': ['auto', 'scroll', 'contents', 'transform', isArbitraryVariable, isArbitraryValue]
      }],
      // -----------
      // --- SVG ---
      // -----------
      /**
       * Fill
       * @see https://tailwindcss.com/docs/fill
       */
      fill: [{
        fill: ['none', ...scaleColor()]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      'stroke-w': [{
        stroke: [isNumber, isArbitraryVariableLength, isArbitraryLength, isArbitraryNumber]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: ['none', ...scaleColor()]
      }],
      // ---------------------
      // --- Accessibility ---
      // ---------------------
      /**
       * Forced Color Adjust
       * @see https://tailwindcss.com/docs/forced-color-adjust
       */
      'forced-color-adjust': [{
        'forced-color-adjust': ['auto', 'none']
      }]
    },
    conflictingClassGroups: {
      'container-named': ['container-type'],
      overflow: ['overflow-x', 'overflow-y'],
      overscroll: ['overscroll-x', 'overscroll-y'],
      inset: ['inset-x', 'inset-y', 'inset-bs', 'inset-be', 'start', 'end', 'top', 'right', 'bottom', 'left'],
      'inset-x': ['right', 'left'],
      'inset-y': ['top', 'bottom'],
      flex: ['basis', 'grow', 'shrink'],
      gap: ['gap-x', 'gap-y'],
      p: ['px', 'py', 'ps', 'pe', 'pbs', 'pbe', 'pt', 'pr', 'pb', 'pl'],
      px: ['pr', 'pl'],
      py: ['pt', 'pb'],
      m: ['mx', 'my', 'ms', 'me', 'mbs', 'mbe', 'mt', 'mr', 'mb', 'ml'],
      mx: ['mr', 'ml'],
      my: ['mt', 'mb'],
      size: ['w', 'h'],
      'font-size': ['leading'],
      'fvn-normal': ['fvn-ordinal', 'fvn-slashed-zero', 'fvn-figure', 'fvn-spacing', 'fvn-fraction'],
      'fvn-ordinal': ['fvn-normal'],
      'fvn-slashed-zero': ['fvn-normal'],
      'fvn-figure': ['fvn-normal'],
      'fvn-spacing': ['fvn-normal'],
      'fvn-fraction': ['fvn-normal'],
      'line-clamp': ['display', 'overflow'],
      rounded: ['rounded-s', 'rounded-e', 'rounded-t', 'rounded-r', 'rounded-b', 'rounded-l', 'rounded-ss', 'rounded-se', 'rounded-ee', 'rounded-es', 'rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl'],
      'rounded-s': ['rounded-ss', 'rounded-es'],
      'rounded-e': ['rounded-se', 'rounded-ee'],
      'rounded-t': ['rounded-tl', 'rounded-tr'],
      'rounded-r': ['rounded-tr', 'rounded-br'],
      'rounded-b': ['rounded-br', 'rounded-bl'],
      'rounded-l': ['rounded-tl', 'rounded-bl'],
      'border-spacing': ['border-spacing-x', 'border-spacing-y'],
      'border-w': ['border-w-x', 'border-w-y', 'border-w-s', 'border-w-e', 'border-w-bs', 'border-w-be', 'border-w-t', 'border-w-r', 'border-w-b', 'border-w-l'],
      'border-w-x': ['border-w-r', 'border-w-l'],
      'border-w-y': ['border-w-t', 'border-w-b'],
      'border-color': ['border-color-x', 'border-color-y', 'border-color-s', 'border-color-e', 'border-color-bs', 'border-color-be', 'border-color-t', 'border-color-r', 'border-color-b', 'border-color-l'],
      'border-color-x': ['border-color-r', 'border-color-l'],
      'border-color-y': ['border-color-t', 'border-color-b'],
      translate: ['translate-x', 'translate-y', 'translate-none'],
      'translate-none': ['translate', 'translate-x', 'translate-y', 'translate-z'],
      'scroll-m': ['scroll-mx', 'scroll-my', 'scroll-ms', 'scroll-me', 'scroll-mbs', 'scroll-mbe', 'scroll-mt', 'scroll-mr', 'scroll-mb', 'scroll-ml'],
      'scroll-mx': ['scroll-mr', 'scroll-ml'],
      'scroll-my': ['scroll-mt', 'scroll-mb'],
      'scroll-p': ['scroll-px', 'scroll-py', 'scroll-ps', 'scroll-pe', 'scroll-pbs', 'scroll-pbe', 'scroll-pt', 'scroll-pr', 'scroll-pb', 'scroll-pl'],
      'scroll-px': ['scroll-pr', 'scroll-pl'],
      'scroll-py': ['scroll-pt', 'scroll-pb'],
      touch: ['touch-x', 'touch-y', 'touch-pz'],
      'touch-x': ['touch'],
      'touch-y': ['touch'],
      'touch-pz': ['touch']
    },
    conflictingClassGroupModifiers: {
      'font-size': ['leading']
    },
    postfixLookupClassGroups: ['container-type'],
    orderSensitiveModifiers: ['*', '**', 'after', 'backdrop', 'before', 'details-content', 'file', 'first-letter', 'first-line', 'marker', 'placeholder', 'selection']
  };
};
const twMerge = /*#__PURE__*/createTailwindMerge(getDefaultConfig);

/**
 * 合并 class 名（clsx + tailwind-merge）。
 * shadcn/ui 约定的工具函数。
 */
function cn(...inputs) {
  return twMerge(clsx(inputs))
}

const _sfc_main$C = {
  __name: 'Button',
  props: {
  variant: { type: String, default: 'default' },
  size: { type: String, default: 'default' },
  class: { type: [String, Object, Array], default: undefined },
},
  setup(__props) {

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-ink text-surface-alt hover:bg-ink-soft',
        secondary: 'bg-canvas text-ink hover:bg-surface-alt',
        outline: 'border border-hairline bg-transparent text-ink hover:bg-surface-alt',
        ghost: 'bg-transparent text-ink hover:bg-surface-alt',
        destructive: 'border border-ember bg-transparent text-ember hover:bg-status-error-soft',
        link: 'text-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const props = __props;

const classes = computed(() =>
  buttonVariants({ variant: props.variant, size: props.size, class: props.class }),
);

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("button", {
    class: normalizeClass(classes.value)
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _hoisted_1$m = ["aria-label"];
const _hoisted_2$g = { class: "flex items-start justify-between gap-4" };
const _hoisted_3$g = { class: "flex-1" };
const _hoisted_4$d = {
  key: 0,
  class: "flex items-center gap-2 text-base font-semibold leading-6 text-ink"
};
const _hoisted_5$c = {
  key: 1,
  class: "mt-1.5 text-sm leading-5 text-mid-gray"
};
const _hoisted_6$c = {
  key: 0,
  class: "mt-4"
};
const _hoisted_7$9 = {
  key: 1,
  class: "mt-5 flex items-center justify-end gap-2"
};

/**
 * 对话框（24px 圆角，§6.1）。
 * 破坏性确认通过 `destructive` 在标题栏展示 ember 图标。
 */

const _sfc_main$B = {
  __name: 'Dialog',
  props: {
  open: { type: Boolean, default: false },
  title: { type: String, default: undefined },
  description: { type: String, default: undefined },
  destructive: { type: Boolean, default: false },
  class: { type: [String, Object, Array], default: undefined },
},
  emits: ['update:open', 'close'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

const contentRef = ref(null);

function close() {
  emit('update:open', false);
  emit('close');
}

function onGlobalKeydown(event) {
  if (event.key === 'Escape') close();
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onGlobalKeydown);
      nextTick(() => contentRef.value?.focus());
    } else {
      document.removeEventListener('keydown', onGlobalKeydown);
    }
  },
);

onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown));

return (_ctx, _cache) => {
  return (openBlock(), createBlock(Teleport, { to: "body" }, [
    (__props.open)
      ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "fixed inset-0 z-50 flex items-center justify-center p-4",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": __props.title
        }, [
          createBaseVNode("div", {
            class: "animate-fade-in-up absolute inset-0 bg-ink/20",
            "aria-hidden": "true",
            onClick: close
          }),
          createBaseVNode("div", {
            ref_key: "contentRef",
            ref: contentRef,
            tabindex: "-1",
            class: normalizeClass(
          unref(cn)(
            'animate-dialog-in relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-y-auto rounded-3xl border border-hairline bg-paper p-5 shadow-overlay outline-none',
            props.class,
          )
        )
          }, [
            createBaseVNode("div", _hoisted_2$g, [
              createBaseVNode("div", _hoisted_3$g, [
                (__props.title)
                  ? (openBlock(), createElementBlock("h2", _hoisted_4$d, [
                      (__props.destructive)
                        ? (openBlock(), createBlock(unref(TriangleAlert), {
                            key: 0,
                            class: "size-4 shrink-0 text-ember"
                          }))
                        : createCommentVNode("", true),
                      createTextVNode(" " + toDisplayString(__props.title), 1)
                    ]))
                  : createCommentVNode("", true),
                (__props.description)
                  ? (openBlock(), createElementBlock("p", _hoisted_5$c, toDisplayString(__props.description), 1))
                  : createCommentVNode("", true)
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "rounded-2xl p-1 text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink",
                "aria-label": "关闭",
                onClick: close
              }, [
                createVNode(unref(X), { class: "size-4" })
              ])
            ]),
            (_ctx.$slots.default)
              ? (openBlock(), createElementBlock("div", _hoisted_6$c, [
                  renderSlot(_ctx.$slots, "default")
                ]))
              : createCommentVNode("", true),
            (_ctx.$slots.footer)
              ? (openBlock(), createElementBlock("div", _hoisted_7$9, [
                  renderSlot(_ctx.$slots, "footer", { close: close })
                ]))
              : createCommentVNode("", true)
          ], 2)
        ], 8, _hoisted_1$m))
      : createCommentVNode("", true)
  ]))
}
}

};

const _hoisted_1$l = ["title", "aria-label"];

/**
 * 插件状态条（§4.4）：就绪（绿）/ 未安装 / 版本过旧（琥珀警告）。
 * 未就绪时禁用领取并给出下载入口。
 */

const _sfc_main$A = {
  __name: 'PluginChip',
  props: {
  state: { type: String, default: 'missing' },
  version: { type: String, default: undefined },
  minVersion: { type: String, default: undefined },
  class: { type: [String, Object, Array], default: undefined },
},
  emits: ['download'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

const meta = computed(() => {
  switch (props.state) {
    case 'ready':
      return { dot: '#16a34a', bg: '#f0fdf4', text: '#15803d', label: `助手已就绪 · ${props.version || '1.0.0'}` }
    case 'outdated':
      return { dot: '#d97706', bg: '#fffbeb', text: '#b45309', label: `版本过旧 ${props.version || '?'} → 最低 ${props.minVersion || '?'}` }
    case 'error':
      return { dot: '#d97706', bg: '#fffbeb', text: '#b45309', label: '服务连接异常' }
    case 'missing':
    default:
      return { dot: '#d97706', bg: '#fffbeb', text: '#b45309', label: '未检测到助手' }
  }
});

// const downloadLabel = computed(() => (props.state === 'outdated' ? '下载最新版' : '下载插件'))

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: normalizeClass(unref(cn)('flex items-center gap-1', props.class))
  }, [
    createBaseVNode("span", {
      class: "size-2 shrink-0 rounded-full",
      style: normalizeStyle({ backgroundColor: meta.value.dot }),
      "aria-hidden": "true"
    }, null, 4),
    createBaseVNode("span", {
      class: "inline-flex items-center gap-1 rounded-2xl px-2 text-xs font-medium",
      style: normalizeStyle({ backgroundColor: meta.value.bg, color: meta.value.text })
    }, toDisplayString(meta.value.label), 5),
    (__props.state === 'missing' || __props.state === 'outdated')
      ? (openBlock(), createElementBlock("button", {
          key: 0,
          type: "button",
          class: "inline-flex items-center gap-1 rounded-2xl px-2 py-0.5 text-xs font-medium text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink",
          title: __props.state === 'outdated' ? '下载最新版助手' : '下载助手（ZIP）',
          "aria-label": __props.state === 'outdated' ? '下载最新版助手' : '下载助手（ZIP）',
          onClick: _cache[0] || (_cache[0] = $event => (emit('download')))
        }, [
          createVNode(unref(Download), { class: "size-3.5" })
        ], 8, _hoisted_1$l))
      : createCommentVNode("", true)
  ], 2))
}
}

};

reactive({
  user: null,
  token: null,
  pool: [
    { id: 1, code: 'KY-01', status: 'AVAILABLE' },
    { id: 2, code: 'KY-02', status: 'IN_USE', expiresAt: isoFromNow(28 * 60 + 4) },
    { id: 3, code: 'KY-03', status: 'IN_USE', expiresAt: isoFromNow(11 * 60 + 20) },
    { id: 4, code: 'KY-04', status: 'RECYCLING' },
    { id: 5, code: 'KY-05', status: 'ERROR' },
    { id: 6, code: 'KY-06', status: 'AVAILABLE' },
    { id: 7, code: 'KY-07', status: 'AVAILABLE' },
    { id: 8, code: 'KY-08', status: 'AVAILABLE' },
    { id: 9, code: 'KY-09', status: 'AVAILABLE' },
    { id: 10, code: 'KY-10', status: 'AVAILABLE' },
  ],
  lease: null,
});

function isoFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

const API_BASE = "/api";
const authState = reactive({
  token: localStorage.getItem("scienceing_token") || "",
  user: safeParse(localStorage.getItem("scienceing_user"))
});
const isLoggedIn = computed(() => Boolean(authState.token));
const isAdmin = computed(() => authState.user?.role === "ADMIN");
const pluginState = reactive({
  status: "detecting",
  version: "",
  minimumVersion: "",
  latestVersion: ""
});
let extensionDetectionStarted = false;
function detectExtension() {
  if (extensionDetectionStarted) return;
  extensionDetectionStarted = true;
  let settled = false;
  const timer = window.setTimeout(() => settle({ status: "missing" }), 3e3);
  function settle(detail) {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    document.removeEventListener("scienceing:extension-ready", onDocumentEvent);
    applyExtensionState(detail);
  }
  function onMessage(e) {
    if (e.source !== window || e.data?.source !== "scienceing-extension") return;
    if (e.data?.type === "EXTENSION_READY") settle(e.data);
  }
  function onDocumentEvent(e) {
    settle(e.detail);
  }
  window.addEventListener("message", onMessage);
  document.addEventListener("scienceing:extension-ready", onDocumentEvent);
  window.postMessage({ source: "scienceing-dashboard", type: "EXTENSION_PING" }, "*");
}
function applyExtensionState(detail) {
  pluginState.version = detail?.version || "";
  pluginState.minimumVersion = detail?.minimumVersion || "";
  pluginState.latestVersion = detail?.latestVersion || "";
  const status = detail?.status;
  pluginState.status = status === "ready" || status === "outdated" || status === "error" ? status : "missing";
}
const EXTENSION_DOWNLOAD_PATH = "/downloads/scienceing-extension.zip";
const extensionPackage = reactive({
  available: false,
  version: "",
  size: 0,
  updatedAt: "",
  downloadPath: EXTENSION_DOWNLOAD_PATH
});
let packageLoading = null;
function loadExtensionPackage() {
  if (packageLoading) return packageLoading;
  packageLoading = http("GET", "/extension/config").then((cfg) => {
    const pkg = cfg?.package;
    extensionPackage.available = Boolean(pkg?.available);
    extensionPackage.version = pkg?.version || "";
    extensionPackage.size = Number(pkg?.size || 0);
    extensionPackage.updatedAt = pkg?.updatedAt || "";
    extensionPackage.downloadPath = pkg?.downloadPath || EXTENSION_DOWNLOAD_PATH;
    return extensionPackage;
  }).catch(() => {
    extensionPackage.available = false;
    return extensionPackage;
  }).finally(() => {
    packageLoading = null;
  });
  return packageLoading;
}
function downloadExtensionZip() {
  const a = document.createElement("a");
  a.href = extensionPackage.downloadPath || EXTENSION_DOWNLOAD_PATH;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function persist() {
  if (authState.token) localStorage.setItem("scienceing_token", authState.token);
  else localStorage.removeItem("scienceing_token");
  if (authState.user) localStorage.setItem("scienceing_user", JSON.stringify(authState.user));
  else localStorage.removeItem("scienceing_user");
}
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
async function http(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (authState.token) headers.Authorization = `Bearer ${authState.token}`;
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      credentials: "include",
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
  } catch {
    throw new ApiError("服务不可用，请稍后重试", 0);
  }
  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join("，") : data?.message || `请求失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }
  return data;
}
async function login(username, password) {
  const data = await http("POST", "/auth/login", { username, password });
  authState.token = data.token;
  authState.user = data.user;
  persist();
  return data;
}
async function logout() {
  {
    try {
      await http("POST", "/auth/logout");
    } catch {
    }
  }
  authState.token = "";
  authState.user = null;
  persist();
}
function getAvailability() {
  return http("GET", "/accounts/availability");
}
function getPool() {
  return http("GET", "/accounts/pool");
}
function claimLease(extensionVersion) {
  return http("POST", "/leases", { extensionVersion });
}
function getCurrentLease() {
  return http("GET", "/leases/current");
}
function releaseLease(leaseId) {
  return http("POST", `/leases/${leaseId}/release`);
}
function getManual() {
  return http("GET", "/manual");
}
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const _hoisted_1$k = { class: "flex min-h-screen w-full flex-col bg-canvas" };
const _hoisted_2$f = { class: "sticky top-0 z-20 border-b border-hairline bg-canvas/90 backdrop-blur" };
const _hoisted_3$f = { class: "page-container flex h-14 items-center gap-3" };
const _hoisted_4$c = { class: "ml-auto flex shrink-0 items-center gap-2 sm:gap-3" };
const _hoisted_5$b = { class: "hidden max-w-[8rem] truncate text-sm text-mid-gray md:inline" };
const _hoisted_6$b = { class: "app-main bg-white" };

/**
 * 公开布局（首页 / 我的账号）
 *
 * 布局与层次（本次优化）：
 * - 顶栏与页面同用 canvas 底色，仅靠 1px hairline 分隔；paper(#ffffff) 只留给
 *   内容卡片。整站只有一条背景基线，白色永远是「被承载的内容面」。
 * - 顶栏右侧导航在窄屏逐级降级（隐藏用户名 → 退出按钮只留图标），
 *   保证 320px 宽下不换行、不溢出。
 * - 助手检测组件（PluginChip）常驻顶栏「科应共享账号」旁，全站可见。
 */

const _sfc_main$z = {
  __name: 'PublicLayout',
  props: {
  /** 内容栏宽度：'default' = 1280px，'narrow' = 768px（稀疏页居中显示） */
  contentWidth: { type: String, default: 'default' },
},
  setup(__props) {

const router = useRouter();
const userLabel = computed(() => authState.user?.displayName || authState.user?.username || '');
const isAdmin = computed(() => authState.user.role === "ADMIN" || false);

// 布局层启动扩展握手检测（幂等），保证顶栏的助手状态在任何页面都可用
onMounted(() => {
  console.log('PublicLayout mounted, detectExtension()');
  // 显示authState.user
  console.log('authState.user:', authState.user);
  detectExtension();
  // 扩展下载包元信息（版本/更新时间），仅供展示，失败不影响下载入口
  loadExtensionPackage();
});

async function onLogout() {
  await logout();
  router.push('/');
}

/** 退出登录二次确认弹窗 */
const logoutOpen = ref(false);
function confirmLogout() {
  logoutOpen.value = false;
  onLogout();
}

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", _hoisted_1$k, [
    createBaseVNode("header", _hoisted_2$f, [
      createBaseVNode("div", _hoisted_3$f, [
        createVNode(unref(RouterLink), {
          to: "/",
          class: "min-w-0 shrink-0 text-base font-semibold leading-6 text-ink"
        }, {
          default: withCtx(() => [...(_cache[3] || (_cache[3] = [
            createTextVNode(" 科应共享账号 ", -1)
          ]))]),
          _: 1
        }),
        createVNode(_sfc_main$A, {
          state: unref(pluginState).status,
          version: unref(pluginState).version,
          "min-version": unref(pluginState).minimumVersion,
          class: "hidden sm:flex",
          onDownload: unref(downloadExtensionZip)
        }, null, 8, ["state", "version", "min-version", "onDownload"]),
        createBaseVNode("div", _hoisted_4$c, [
          createVNode(unref(RouterLink), {
            to: "/manual",
            class: "rounded-2xl px-2 py-1.5 text-sm text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
          }, {
            default: withCtx(() => [...(_cache[4] || (_cache[4] = [
              createTextVNode(" 使用手册 ", -1)
            ]))]),
            _: 1
          }),
          (unref(isLoggedIn))
            ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                (isAdmin.value)
                  ? (openBlock(), createBlock(unref(RouterLink), {
                      key: 0,
                      to: "/admin/dashboard",
                      class: "rounded-2xl px-2 py-1.5 text-sm text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
                    }, {
                      default: withCtx(() => [...(_cache[5] || (_cache[5] = [
                        createTextVNode(" 管理后台 ", -1)
                      ]))]),
                      _: 1
                    }))
                  : createCommentVNode("", true),
                createVNode(unref(RouterLink), {
                  to: "/my",
                  class: "rounded-2xl px-2 py-1.5 text-sm text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
                }, {
                  default: withCtx(() => [...(_cache[6] || (_cache[6] = [
                    createTextVNode(" 我的账号 ", -1)
                  ]))]),
                  _: 1
                }),
                createBaseVNode("span", _hoisted_5$b, toDisplayString(userLabel.value), 1),
                createBaseVNode("button", {
                  type: "button",
                  class: "inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-sm font-medium text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink",
                  onClick: _cache[0] || (_cache[0] = $event => (logoutOpen.value = true))
                }, [
                  createVNode(unref(LogOut), { class: "size-4" }),
                  _cache[7] || (_cache[7] = createBaseVNode("span", { class: "hidden sm:inline" }, "退出", -1))
                ])
              ], 64))
            : (openBlock(), createBlock(unref(RouterLink), {
                key: 1,
                to: "/login"
              }, {
                default: withCtx(() => [
                  createVNode(_sfc_main$C, {
                    variant: "outline",
                    size: "sm"
                  }, {
                    default: withCtx(() => [...(_cache[8] || (_cache[8] = [
                      createTextVNode("登录", -1)
                    ]))]),
                    _: 1
                  })
                ]),
                _: 1
              }))
        ])
      ])
    ]),
    createBaseVNode("main", _hoisted_6$b, [
      createBaseVNode("div", {
        class: normalizeClass(['page-container', __props.contentWidth === 'narrow' && 'page-container-narrow'])
      }, [
        renderSlot(_ctx.$slots, "default")
      ], 2)
    ]),
    createVNode(_sfc_main$B, {
      open: logoutOpen.value,
      title: "退出登录？",
      description: "退出后将返回登录页，需重新登录才能继续访问账号。",
      "onUpdate:open": _cache[2] || (_cache[2] = (v) => (logoutOpen.value = v))
    }, {
      footer: withCtx(() => [
        createVNode(_sfc_main$C, {
          variant: "outline",
          onClick: _cache[1] || (_cache[1] = $event => (logoutOpen.value = false))
        }, {
          default: withCtx(() => [...(_cache[9] || (_cache[9] = [
            createTextVNode("取消", -1)
          ]))]),
          _: 1
        }),
        createVNode(_sfc_main$C, {
          variant: "default",
          onClick: confirmLogout
        }, {
          default: withCtx(() => [...(_cache[10] || (_cache[10] = [
            createTextVNode("确认退出", -1)
          ]))]),
          _: 1
        })
      ]),
      _: 1
    }, 8, ["open"])
  ]))
}
}

};

const _hoisted_1$j = { class: "text-xs font-medium leading-none text-mid-gray" };
const _hoisted_2$e = { class: "flex items-center gap-2 text-[28px] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums sm:text-[32px] lg:text-[36px]" };
const _hoisted_3$e = {
  key: 0,
  class: "text-sm leading-5 text-mid-gray"
};

/**
 * Stat Block（DESIGN.md）：label 12px/500 #737373 + value 36px/600 #0a0a0a tabular。
 * 纯排版层级，不使用卡片包裹。
 */

const _sfc_main$y = {
  __name: 'StatBlock',
  props: {
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  /** 值旁可选状态圆点（池统计用语义色，仅状态标签元素） */
  dot: { type: String, default: undefined },
  hint: { type: String, default: undefined },
  class: { type: [String, Object, Array], default: undefined },
},
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: normalizeClass(unref(cn)('flex flex-col gap-1', props.class))
  }, [
    createBaseVNode("span", _hoisted_1$j, toDisplayString(__props.label), 1),
    createBaseVNode("span", _hoisted_2$e, [
      (__props.dot)
        ? (openBlock(), createElementBlock("span", {
            key: 0,
            class: "size-2.5 shrink-0 rounded-full",
            style: normalizeStyle({ backgroundColor: __props.dot }),
            "aria-hidden": "true"
          }, null, 4))
        : createCommentVNode("", true),
      createTextVNode(" " + toDisplayString(__props.value), 1)
    ]),
    (__props.hint)
      ? (openBlock(), createElementBlock("span", _hoisted_3$e, toDisplayString(__props.hint), 1))
      : createCommentVNode("", true)
  ], 2))
}
}

};

/**
 * 状态语义元数据（PRODUCT-DESIGN §4.1）。
 *
 * 语义色唯一合法边界：状态圆点 / 状态徽章。
 * 圆点颜色 = 主题令牌；soft 徽章使用「色 50 级底 + 色 700 级文本」。
 */
const STATUS_META = {
  available: {
    label: '可用',
    dot: '#16a34a',
    softBg: '#f0fdf4',
    softText: '#15803d',
  },
  in_use: {
    label: '使用中',
    dot: '#2563eb',
    softBg: '#eff6ff',
    softText: '#1d4ed8',
  },
  recycling: {
    label: '回收中',
    dot: '#d97706',
    softBg: '#fffbeb',
    softText: '#b45309',
    hollow: true,
    spin: true,
  },
  error: {
    label: '异常',
    dot: '#e7000b',
    softBg: '#fdecec',
    softText: '#e7000b',
  },
  released: {
    label: '已释放',
    dot: '#737373',
    softBg: 'transparent',
    softText: '#737373',
    hollow: true,
  },
};

/**
 * 将任意后端状态字符串（Account / Lease）归一为 StatusKind。
 * 后端约定：AVAILABLE/IN_USE/RECYCLING/ERROR、ACTIVE→in_use、RELEASED→released 等。
 */
function toStatusKind(raw) {
  const v = (raw ?? '').toUpperCase();
  if (v === 'AVAILABLE') return 'available'
  if (v === 'IN_USE' || v === 'ACTIVE') return 'in_use'
  if (v === 'RECYCLING' || v === 'RELEASE_REQUESTED' || v === 'TIMEOUT') return 'recycling'
  if (v === 'ERROR' || v === 'FAILED' || v === 'RESET_ERROR') return 'error'
  return 'released'
}

const _hoisted_1$i = ["aria-label"];
const _hoisted_2$d = {
  class: "relative inline-flex size-2 shrink-0 items-center justify-center",
  "aria-hidden": "true"
};
const _hoisted_3$d = {
  key: 1,
  class: "status-dot-spin size-2.5",
  viewBox: "0 0 12 12",
  fill: "none"
};
const _hoisted_4$b = ["stroke"];
const _hoisted_5$a = ["stroke"];
const _hoisted_6$a = { class: "text-xs font-medium leading-none text-mid-gray" };

/**
 * 状态圆点 + 文本（§4.1）。
 * 文本是语义主通道（灰度滤镜下仍可读）；圆点是强化通道。
 * 回收中 = 琥珀空心 + ¾ 弧 SVG 旋转（2s/圈，prefers-reduced-motion 时静止）。
 */

const _sfc_main$x = {
  __name: 'StatusDot',
  props: {
  status: { type: String, required: true },
  label: { type: String, default: undefined },
  class: { type: [String, Object, Array], default: undefined },
},
  setup(__props) {

const props = __props;

const meta = computed(() => STATUS_META[props.status] ?? STATUS_META.released);
const text = computed(() => props.label ?? meta.value.label);

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("span", {
    role: "status",
    "aria-label": text.value,
    class: normalizeClass(unref(cn)('inline-flex select-none items-center gap-1.5 align-middle', props.class))
  }, [
    createBaseVNode("span", _hoisted_2$d, [
      (!meta.value.hollow)
        ? (openBlock(), createElementBlock("span", {
            key: 0,
            class: "size-2 rounded-full",
            style: normalizeStyle({ backgroundColor: meta.value.dot })
          }, null, 4))
        : (meta.value.spin)
          ? (openBlock(), createElementBlock("svg", _hoisted_3$d, [
              createBaseVNode("circle", {
                cx: "6",
                cy: "6",
                r: "4",
                stroke: meta.value.dot,
                "stroke-opacity": "0.25",
                "stroke-width": "1.5"
              }, null, 8, _hoisted_4$b),
              createBaseVNode("circle", {
                cx: "6",
                cy: "6",
                r: "4",
                stroke: meta.value.dot,
                "stroke-width": "1.5",
                "stroke-linecap": "round",
                "stroke-dasharray": "18.85 6.28"
              }, null, 8, _hoisted_5$a)
            ]))
          : (openBlock(), createElementBlock("span", {
              key: 2,
              class: "size-2 rounded-full border",
              style: normalizeStyle({ borderColor: meta.value.dot })
            }, null, 4))
    ]),
    createBaseVNode("span", _hoisted_6$a, toDisplayString(text.value), 1)
  ], 10, _hoisted_1$i))
}
}

};

const _sfc_main$w = {
  __name: 'Card',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: normalizeClass(unref(cn)('rounded-3xl bg-paper shadow-subtle', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$v = {
  __name: 'Skeleton',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: normalizeClass(unref(cn)('animate-skeleton rounded-2xl bg-canvas', props.class))
  }, null, 2))
}
}

};

/**
 * 审计动作中文名（与后端 AUDIT_ACTION_LABEL 一致）。
 * 系统日志页展示/筛选用；后端 /admin/logs 已下发 actionLabel 时优先用后端值，
 * 此处作为筛选 options 与兜底（旧缓存/mock 缺字段时）。
 */
const ACTION_LABELS = {
  LOGIN: '登录',
  LOGOUT: '退出登录',
  USER_CREATE: '新增用户',
  USER_UPDATE: '修改用户',
  USER_PASSWORD_RESET: '重置用户密码',
  USER_BULK_CREATE: '批量导入用户',
  CLAIM_ACCOUNT: '领取账号',
  ACTIVITY: '活跃上报',
  RELEASE: '归还账号',
  TIMEOUT: '超时回收',
  RESET_PASSWORD: '发起改密',
  RESET_SUCCESS: '改密成功',
  RESET_FAILED: '改密失败',
  ADMIN_FORCE_RELEASE: '强制回收',
  ADMIN_MANUAL_FIX: '人工修复完成',
  ACCOUNT_DISABLE: '停用账号',
  ACCOUNT_ENABLE: '启用账号',
  ACCOUNT_CREATE: '新增科应账号',
  ACCOUNT_DELETE: '删除科应账号',
  ACCOUNT_BULK_CREATE: '批量导入科应账号',
  ACCOUNT_RENAME: '修改科应账号',
  SETTING_UPDATE: '参数更新',
  MANUAL_UPDATE: '更新使用手册',
  PASSWORD_DECRYPT_FAILED: '密码解密失败',
};

/** 取动作中文名：后端 actionLabel 优先，本地表兜底，未知动作显示英文原文。 */
function actionLabelOf(action, fallback) {
  return fallback || ACTION_LABELS[action] || action
}

/**
 * 管理后台内存 mock 后端（t8）。真实联调时由 admin.js 切到 fetch。
 * 响应形状对齐 apps/server 各 admin 控制器。
 */
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function ago(ms) {
  return new Date(Date.now() - ms).toISOString()
}

reactive({
  users: [
    { id: 1, username: 'admin', displayName: '管理员', department: 'IT', role: 'ADMIN', enabled: true, createdAt: ago(30 * DAY), updatedAt: ago(2 * DAY) },
    { id: 2, username: 'zhangsan', displayName: '张三', department: '研发部', role: 'USER', enabled: true, createdAt: ago(20 * DAY), updatedAt: ago(5 * DAY) },
    { id: 3, username: 'lisi', displayName: '李四', department: '产品部', role: 'USER', enabled: false, createdAt: ago(15 * DAY), updatedAt: ago(3 * DAY) },
    { id: 4, username: 'wangwu', displayName: '王五', department: 'IT', role: 'USER', enabled: true, createdAt: ago(10 * DAY), updatedAt: ago(1 * DAY) },
  ],
  accounts: [
    { id: 1, code: 'KY-01', username: 'ky-01', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 2, code: 'KY-02', username: 'ky-02', status: 'IN_USE', currentUser: '张三', lastPasswordChangedAt: ago(5 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 3, code: 'KY-03', username: 'ky-03', status: 'IN_USE', currentUser: '李四', lastPasswordChangedAt: ago(4 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 4, code: 'KY-04', username: 'ky-04', status: 'RECYCLING', currentUser: null, lastPasswordChangedAt: ago(2 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 5, code: 'KY-05', username: 'ky-05', status: 'ERROR', currentUser: null, lastPasswordChangedAt: ago(1 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 6, code: 'KY-06', username: 'ky-06', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 7, code: 'KY-07', username: 'ky-07', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 8, code: 'KY-08', username: 'ky-08', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 9, code: 'KY-09', username: 'ky-09', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 10, code: 'KY-10', username: 'ky-10', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
  ],
  leases: [
    { id: 104, userDisplayName: '张三', accountCode: 'KY-02', status: 'ACTIVE', startedAt: ago(HOUR), lastActivityAt: ago(3 * MIN), releasedAt: null, releaseReason: null },
    { id: 103, userDisplayName: '王五', accountCode: 'KY-01', status: 'RELEASED', startedAt: ago(DAY), lastActivityAt: ago(DAY - 2 * HOUR), releasedAt: ago(DAY - 2 * HOUR + MIN), releaseReason: 'USER_RETURN' },
    { id: 102, userDisplayName: '李四', accountCode: 'KY-03', status: 'RELEASED', startedAt: ago(2 * DAY), lastActivityAt: ago(2 * DAY - 30 * MIN), releasedAt: ago(2 * DAY - 30 * MIN), releaseReason: 'INACTIVITY_TIMEOUT' },
    { id: 101, userDisplayName: '张三', accountCode: 'KY-04', status: 'FAILED', startedAt: ago(3 * DAY), lastActivityAt: ago(3 * DAY - 25 * MIN), releasedAt: ago(3 * DAY - 25 * MIN), releaseReason: 'RESET_ERROR' },
    { id: 100, userDisplayName: '李四', accountCode: 'KY-02', status: 'RELEASED', startedAt: ago(4 * DAY), lastActivityAt: ago(4 * DAY - 40 * MIN), releasedAt: ago(4 * DAY - 40 * MIN), releaseReason: 'ADMIN_FORCE' },
  ],
  logs: [
    { id: 12, userId: null, accountId: 5, leaseId: null, action: 'RESET_FAILED', result: 'FAILED', ip: null, userAgent: null, metadata: { accountCode: 'KY-05' }, createdAt: ago(9 * MIN) },
    { id: 11, userId: 1, accountId: 5, leaseId: null, action: 'RESET_PASSWORD', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { accountCode: 'KY-05' }, createdAt: ago(10 * MIN) },
    { id: 10, userId: 2, accountId: 2, leaseId: 104, action: 'CLAIM_ACCOUNT', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { accountCode: 'KY-02' }, createdAt: ago(15 * MIN) },
    { id: 9, userId: 2, accountId: null, leaseId: null, action: 'LOGIN', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: null, createdAt: ago(16 * MIN) },
    { id: 8, userId: 2, accountId: 2, leaseId: 104, action: 'ACTIVITY', result: 'SUCCESS', ip: null, userAgent: null, metadata: null, createdAt: ago(20 * MIN) },
    { id: 7, userId: 2, accountId: 2, leaseId: 104, action: 'ACTIVITY', result: 'SUCCESS', ip: null, userAgent: null, metadata: null, createdAt: ago(25 * MIN) },
    { id: 6, userId: 1, accountId: 4, leaseId: null, action: 'ADMIN_FORCE_RELEASE', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { accountCode: 'KY-04' }, createdAt: ago(DAY) },
    { id: 5, userId: 4, accountId: 1, leaseId: 103, action: 'RELEASE', result: 'SUCCESS', ip: '10.2.1.9', userAgent: null, metadata: { reason: 'USER_RETURN' }, createdAt: ago(DAY - HOUR) },
    { id: 4, userId: 4, accountId: 1, leaseId: 103, action: 'CLAIM_ACCOUNT', result: 'SUCCESS', ip: '10.2.1.9', userAgent: null, metadata: { accountCode: 'KY-01' }, createdAt: ago(DAY - 2 * HOUR) },
    { id: 3, userId: 3, accountId: 3, leaseId: 102, action: 'TIMEOUT', result: 'SUCCESS', ip: null, userAgent: null, metadata: { reason: 'INACTIVITY_TIMEOUT' }, createdAt: ago(2 * DAY) },
    { id: 2, userId: 3, accountId: 3, leaseId: 102, action: 'CLAIM_ACCOUNT', result: 'SUCCESS', ip: '10.2.1.10', userAgent: null, metadata: { accountCode: 'KY-03' }, createdAt: ago(2 * DAY - 30 * MIN) },
    { id: 1, userId: 1, accountId: null, leaseId: null, action: 'SETTING_UPDATE', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { keys: ['warning_seconds'] }, createdAt: ago(3 * DAY) },
  ],
  settings: {
    // 无操作超时以「分钟」为单位（与后端 system_settings.inactivity_timeout_minutes 一致）
    inactivity_timeout_minutes: '30',
    warning_seconds: '300',
    critical_warning_seconds: '60',
    activity_throttle_seconds: '5',
    extension_min_version: '1.0.0',
    extension_latest_version: '1.3.0',
  },
  health: {
    lastCheckedAt: ago(5 * MIN),
    items: [
      { key: 'admin-login', label: '管理员登录正常', ok: true },
      { key: 'accounts-page', label: '账号管理页可访问', ok: true },
      { key: 'reset-entry', label: '改密入口正常', ok: true },
    ],
  },
  // 使用手册（t13）：content 初始为空串，首次访问时用 MANUAL_MOCK_CONTENT 兜底
  manual: {
    slug: 'user-guide',
    title: '科应共享账号管理平台 · 使用手册（Mock）',
    content: '',
    updatedAt: '',
    updatedByDisplayName: null,
    isDefault: true,
  },
});

/**
 * 管理后台 API（admin 端点，全部要求 ADMIN 会话）。
 * 真实端点见 apps/server/src/modules/{admin,users,audit,extension,settings}。
 */

function getAdminAccounts() {
  return http('GET', '/admin/accounts')
}

function forceRelease(accountId) {
  return http('POST', `/admin/accounts/${accountId}/force-release`)
}

function resetPassword(accountId) {
  return http('POST', `/admin/accounts/${accountId}/reset-password`)
}

function markAvailable(accountId) {
  return http('POST', `/admin/accounts/${accountId}/mark-available`)
}

function disableAccount(accountId) {
  return http('POST', `/admin/accounts/${accountId}/disable`)
}

function enableAccount(accountId) {
  return http('POST', `/admin/accounts/${accountId}/enable`)
}

/** 修改账号名称（对应科应平台账号）：PATCH /admin/accounts/:id */
function renameAccount(accountId, dto) {
  return http('PATCH', `/admin/accounts/${accountId}`, dto)
}

/** 新增科应账号：POST /admin/accounts { code, username } */
function createAccount(dto) {
  return http('POST', '/admin/accounts', dto)
}

/** 删除科应账号：DELETE /admin/accounts/:id */
function deleteAccount(accountId) {
  return http('DELETE', `/admin/accounts/${accountId}`)
}

/** CSV 批量导入（前端解析、二次确认后整批提交）：POST /admin/accounts/bulk */
function bulkCreateAccounts(accounts) {
  return http('POST', '/admin/accounts/bulk', { accounts })
}

function getAdminUsers() {
  return http('GET', '/admin/users')
}

function createUser(dto) {
  return http('POST', '/admin/users', dto)
}

/** CSV 批量导入（前端解析、二次确认后整批提交）：POST /admin/users/bulk */
function bulkCreateUsers(users) {
  return http('POST', '/admin/users/bulk', { users })
}

function updateUser(userId, dto) {
  return http('PATCH', `/admin/users/${userId}`, dto)
}

/**
 * 敏感操作前的管理员自证：POST /admin/verify-password { password } → { verifyToken, expiresAt }
 * verifyToken 为 HMAC 短时票据（5 分钟），供重置用户密码等操作的前置验证。
 */
function verifyAdminPassword(password) {
  return http('POST', '/admin/verify-password', { password })
}

/** 重置用户登录密码（须携带 verifyToken）：POST /admin/users/:id/reset-password */
function resetUserPassword(userId, newPassword, verifyToken) {
  return http('POST', `/admin/users/${userId}/reset-password`, { newPassword, verifyToken })
}

function getAdminLeases(params) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  return http('GET', `/admin/leases?${qs.toString()}`)
}

function getAdminLogs(params) {
  const qs = new URLSearchParams();
  if (params?.action) qs.set('action', params.action);
  if (params?.hideActivity) qs.set('hideActivity', params.hideActivity);
  qs.set('page', String(params?.page ?? 1));
  qs.set('pageSize', String(params?.pageSize));
  return http('GET', `/admin/logs?${qs.toString()}`)
}

function getSettings() {
  return http('GET', '/admin/settings')
}

function updateSettings(dto) {
  return http('POST', '/admin/settings', dto)
}

/** 保存使用手册：PUT /admin/manual { title, content } */
function updateManual(dto) {
  return http('PUT', '/admin/manual', dto)
}

/** 数据看板统计：GET /admin/dashboard?days=7|30|90 */
function getDashboardStats(days = 30) {
  const qs = new URLSearchParams();
  qs.set('days', String(days));
  return http('GET', `/admin/dashboard?${qs.toString()}`)
}

function getExtensionConfig() {
  return http('GET', '/extension/config')
}

function runHealthCheck() {
  // 真实健康检查端点由 t12 提供；当前 mock。
  return http('POST', '/admin/health-check')
}

const _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};

const _hoisted_1$h = { class: "flex flex-col gap-4 py-4 sm:py-5" };
const _hoisted_2$c = {
  key: 0,
  class: "grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4"
};
const _hoisted_3$c = {
  key: 1,
  class: "grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4"
};
const _hoisted_4$a = {
  key: 2,
  class: "grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4"
};
const _hoisted_5$9 = { class: "bg-paper p-4 sm:p-5" };
const _hoisted_6$9 = { class: "bg-paper p-4 sm:p-5" };
const _hoisted_7$8 = { class: "bg-paper p-4 sm:p-5" };
const _hoisted_8$7 = { class: "bg-paper p-4 sm:p-5" };
const _hoisted_9$7 = { class: "flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-2 sm:p-4" };
const _hoisted_10$6 = { class: "flex flex-wrap items-center gap-2" };
const _hoisted_11$6 = { class: "px-2 sm:px-5" };
const _hoisted_12$6 = {
  key: 0,
  class: "flex flex-col gap-3 py-3"
};
const _hoisted_13$6 = {
  key: 1,
  class: "flex flex-col items-start gap-3 py-3"
};
const _hoisted_14$6 = { class: "text-sm text-mid-gray" };
const _hoisted_15$6 = {
  key: 2,
  class: "py-3 text-sm text-mid-gray"
};
const _hoisted_16$5 = {
  key: 3,
  class: "grid grid-cols-1 gap-3 py-3 sm:grid-cols-2 md:grid-cols-4"
};
const _hoisted_17$5 = ["onClick"];
const _hoisted_18$4 = { class: "flex items-start justify-between gap-2" };
const _hoisted_19$3 = { class: "min-w-0" };
const _hoisted_20$2 = { class: "truncate text-sm font-semibold text-ink" };
const _hoisted_21$2 = {
  key: 0,
  class: "truncate text-xs text-mid-gray"
};
const _hoisted_22$2 = { class: "mt-2 text-xs text-mid-gray" };
const _hoisted_23$1 = {
  key: 2,
  class: "text-ember"
};
const _hoisted_24 = {
  key: 3,
  class: "text-ember"
};


const _sfc_main$u = {
  __name: 'HomePage',
  setup(__props) {

const router = useRouter();

const loading = ref(true);
const error = ref('');
const availability = ref({ total: 0, available: 0, inUse: 0, recycling: 0, error: 0 });
const pool = ref([]);
const hasActiveLease = ref(false);
const claiming = ref(false);

let pollTimer;

/**
 * 统一为卡片模型：公开池只有 code/status/estimatedReleaseAt（游客）；
 * 管理员视图额外含 id/username/currentUser/enabled，用于完整信息展示。
 * （管理操作按钮已迁移至 /admin/accounts，本页只读展示。）
 */
function normalizeCard(a) {
  return {
    id: a.id ?? null,
    code: a.code,
    username: a.username ?? '',
    status: toStatusKind(a.status),
    enabled: a.enabled ?? true,
    estimatedReleaseAt: a.estimatedReleaseAt ?? null,
    currentUser: a.currentUser ?? null,
  }
}

async function load() {
  try {
    const [avail] = await Promise.all([getAvailability()]);
    availability.value = avail;
    const rows = isAdmin.value ? await getAdminAccounts() : await getPool();
    pool.value = (rows || []).map(normalizeCard);
    error.value = '';

    if (isLoggedIn.value) {
      try {
        const { lease } = await getCurrentLease();
        hasActiveLease.value = Boolean(lease);
      } catch {
        hasActiveLease.value = false;
      }
    }
  } catch (e) {
    error.value = e?.message || '服务不可用';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  pollTimer = window.setInterval(load, 10_000);
});

onBeforeUnmount(() => window.clearInterval(pollTimer));

const pluginReady = computed(() => pluginState.status === 'ready');

/** 由 estimatedReleaseAt（ISO 时间戳）计算剩余秒数。 */
function remainingOf(account) {
  if (!account?.estimatedReleaseAt) return null
  return Math.max(0, Math.floor((new Date(account.estimatedReleaseAt).getTime() - Date.now()) / 1000))
}

function cardVisual(a) {
  const m = STATUS_META[a.status] || STATUS_META.released;
  let border = m.dot;
  let bg = m.softBg;
  let recycling = false;
  if (a.status === 'recycling') recycling = a.enabled;
  if (a.status === 'released') {
    border = '#d4d4d4';
    bg = '#fafafa';
  }
  if (!a.enabled) {
    border = '#d4d4d4';
    bg = '#fafafa';
    recycling = false;
  }
  return { border, bg, recycling }
}

function cardStyle(a) {
  const v = cardVisual(a);
  return { border: `2px solid ${v.border}`, background: v.bg }
}

function statusLabel(s) {
  return (STATUS_META[s] || STATUS_META.released).label
}

const cta = computed(() => {
  if (!isLoggedIn.value) return { kind: 'login', label: '登录后使用' }
  if (hasActiveLease.value) return { kind: 'mine', label: '查看我的账号 →' }
  return { kind: 'claim', label: '我要使用科应' }
});

async function onCta() {
  const c = cta.value;
  if (c.kind === 'login') {
    router.push('/login');
    return
  }
  if (c.kind === 'mine') {
    router.push('/my');
    return
  }
  claiming.value = true;
  try {
    const res = await claimLease(pluginState.version);
    // 暂存 leaseToken（后端只存其哈希、无法从 current 还原），供「打开科应」BIND_AND_OPEN 使用
    if (res?.leaseToken) sessionStorage.setItem('scienceing_lease_token', res.leaseToken);
    toast({ title: `已领取 ${res.account.code}`, description: '正在跳转到我的账号…', variant: 'success' });
    router.push('/my');
  } catch (e) {
    toast({ title: e?.message || '领取失败', variant: e?.status === 409 ? 'default' : 'destructive' });
    load();
  } finally {
    claiming.value = false;
  }
}

/**
 * 管理员点击卡片 → 进入 /admin/accounts（操作已集中到该页）；
 * 游客/普通用户点击无动作（返回 false）。
 */
function openAccount(card) {
  if (isAdmin.value && card?.id != null) {
    router.push('/admin/accounts');
  }
  return false
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(_sfc_main$z, null, {
    default: withCtx(() => [
      createBaseVNode("div", _hoisted_1$h, [
        createVNode(_sfc_main$w, { class: "overflow-hidden" }, {
          default: withCtx(() => [
            (loading.value)
              ? (openBlock(), createElementBlock("div", _hoisted_2$c, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(4, (i) => {
                    return createBaseVNode("div", {
                      key: i,
                      class: "flex flex-col gap-2 bg-paper p-4 sm:p-5"
                    }, [
                      createVNode(_sfc_main$v, { class: "h-3 w-12" }),
                      createVNode(_sfc_main$v, { class: "h-8 w-14 sm:h-9" })
                    ])
                  }), 64))
                ]))
              : (error.value)
                ? (openBlock(), createElementBlock("div", _hoisted_3$c, [...(_cache[0] || (_cache[0] = [
                    createBaseVNode("div", { class: "flex flex-col gap-2 bg-paper p-4 sm:p-5" }, [
                      createBaseVNode("span", { class: "text-xs font-medium leading-none text-mid-gray" }, "账号池"),
                      createBaseVNode("span", { class: "text-2xl font-semibold leading-none text-ember sm:text-[28px]" }, " 不可用 ")
                    ], -1)
                  ]))]))
                : (openBlock(), createElementBlock("div", _hoisted_4$a, [
                    createBaseVNode("div", _hoisted_5$9, [
                      createVNode(_sfc_main$y, {
                        label: "可用",
                        value: availability.value.available,
                        dot: "#16a34a"
                      }, null, 8, ["value"])
                    ]),
                    createBaseVNode("div", _hoisted_6$9, [
                      createVNode(_sfc_main$y, {
                        label: "使用中",
                        value: availability.value.inUse,
                        dot: "#2563eb"
                      }, null, 8, ["value"])
                    ]),
                    createBaseVNode("div", _hoisted_7$8, [
                      createVNode(_sfc_main$y, {
                        label: "回收中",
                        value: availability.value.recycling,
                        dot: "#d97706"
                      }, null, 8, ["value"])
                    ]),
                    createBaseVNode("div", _hoisted_8$7, [
                      createVNode(_sfc_main$y, {
                        label: "异常",
                        value: availability.value.error,
                        dot: "#e7000b"
                      }, null, 8, ["value"])
                    ])
                  ]))
          ]),
          _: 1
        }),
        createVNode(_sfc_main$w, null, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_9$7, [
              _cache[1] || (_cache[1] = createBaseVNode("h2", { class: "text-base font-semibold leading-6 text-ink" }, "账号池", -1)),
              createBaseVNode("div", _hoisted_10$6, [
                (cta.value.kind === 'claim')
                  ? (openBlock(), createBlock(_sfc_main$C, {
                      key: 0,
                      disabled: !pluginReady.value || claiming.value,
                      onClick: onCta
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(claiming.value ? '领取中…' : cta.value.label), 1)
                      ]),
                      _: 1
                    }, 8, ["disabled"]))
                  : (cta.value.kind === 'login')
                    ? (openBlock(), createBlock(_sfc_main$C, {
                        key: 1,
                        variant: "outline",
                        onClick: onCta
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(cta.value.label), 1)
                        ]),
                        _: 1
                      }))
                    : (openBlock(), createBlock(_sfc_main$C, {
                        key: 2,
                        variant: "ghost",
                        onClick: onCta
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(cta.value.label), 1)
                        ]),
                        _: 1
                      }))
              ])
            ]),
            createBaseVNode("div", _hoisted_11$6, [
              (loading.value)
                ? (openBlock(), createElementBlock("div", _hoisted_12$6, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(4, (i) => {
                      return createVNode(_sfc_main$v, {
                        key: i,
                        class: "h-24 w-full"
                      })
                    }), 64))
                  ]))
                : (error.value)
                  ? (openBlock(), createElementBlock("div", _hoisted_13$6, [
                      createBaseVNode("p", _hoisted_14$6, toDisplayString(error.value) + "，账号池数据暂不可用。", 1),
                      createVNode(_sfc_main$C, {
                        variant: "outline",
                        size: "sm",
                        onClick: load
                      }, {
                        default: withCtx(() => [...(_cache[2] || (_cache[2] = [
                          createTextVNode("重试", -1)
                        ]))]),
                        _: 1
                      })
                    ]))
                  : (pool.value.length === 0)
                    ? (openBlock(), createElementBlock("p", _hoisted_15$6, [
                        _cache[3] || (_cache[3] = createTextVNode(" 暂无科应账号，", -1)),
                        (unref(isAdmin))
                          ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                              createTextVNode("请前往「账号管理」页录入。")
                            ], 64))
                          : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                              createTextVNode("请联系管理员录入。")
                            ], 64))
                      ]))
                    : (openBlock(), createElementBlock("div", _hoisted_16$5, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(pool.value, (card) => {
                          return (openBlock(), createElementBlock("div", {
                            key: card.id ?? card.code,
                            class: normalizeClass(["account-card flex flex-col rounded-2xl p-4 shadow-sm cursor-pointer", [!card.enabled ? 'opacity-60' : '', cardVisual(card).recycling ? 'is-recycling' : '']]),
                            style: normalizeStyle(cardStyle(card)),
                            onClick: $event => (openAccount(card))
                          }, [
                            createBaseVNode("div", _hoisted_18$4, [
                              createBaseVNode("div", _hoisted_19$3, [
                                createBaseVNode("div", _hoisted_20$2, toDisplayString(card.code), 1),
                                (unref(isAdmin) && card.username)
                                  ? (openBlock(), createElementBlock("div", _hoisted_21$2, toDisplayString(card.username), 1))
                                  : createCommentVNode("", true)
                              ]),
                              createVNode(_sfc_main$x, {
                                status: card.status,
                                label: card.enabled ? '' : '已禁用'
                              }, null, 8, ["status", "label"])
                            ]),
                            createBaseVNode("div", _hoisted_22$2, [
                              (card.status === 'in_use')
                                ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                                    (unref(isAdmin) && card.currentUser)
                                      ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                                          createTextVNode("使用中 · " + toDisplayString(card.currentUser), 1)
                                        ], 64))
                                      : (remainingOf(card) != null)
                                        ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                                            createTextVNode("预计释放 " + toDisplayString(unref(formatDuration)(remainingOf(card))), 1)
                                          ], 64))
                                        : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                                            createTextVNode("使用中")
                                          ], 64))
                                  ], 64))
                                : (card.status === 'recycling')
                                  ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                                      createTextVNode("回收中…")
                                    ], 64))
                                  : (card.status === 'error')
                                    ? (openBlock(), createElementBlock("span", _hoisted_23$1, "需人工处理"))
                                    : (!card.enabled)
                                      ? (openBlock(), createElementBlock("span", _hoisted_24, "已禁用"))
                                      : (card.status === 'available')
                                        ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
                                            createTextVNode("可领取")
                                          ], 64))
                                        : (openBlock(), createElementBlock(Fragment, { key: 5 }, [
                                            createTextVNode(toDisplayString(statusLabel(card.status)), 1)
                                          ], 64))
                            ])
                          ], 14, _hoisted_17$5))
                        }), 128))
                      ]))
            ])
          ]),
          _: 1
        })
      ])
    ]),
    _: 1
  }))
}
}

};
const HomePage = /*#__PURE__*/_export_sfc(_sfc_main$u, [['__scopeId',"data-v-b83fd76f"]]);

const _hoisted_1$g = ["type", "value", "placeholder"];


const _sfc_main$t = {
  __name: 'Input',
  props: {
  class: { type: [String, Object, Array], default: undefined },
  type: { type: String, default: 'text' },
  modelValue: { type: [String, Number], default: '' },
  placeholder: { type: String, default: undefined },
},
  emits: ['update:modelValue'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

function onInput(event) {
  emit('update:modelValue', event.target.value);
}

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("input", {
    type: __props.type,
    value: __props.modelValue,
    placeholder: __props.placeholder,
    class: normalizeClass(
      unref(cn)(
        'h-9 w-full rounded-2xl border border-transparent bg-canvas px-3 text-sm text-ink placeholder:text-mid-gray focus:border-hairline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    ),
    onInput: onInput
  }, null, 42, _hoisted_1$g))
}
}

};

const _sfc_main$s = {
  __name: 'Label',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("label", {
    class: normalizeClass(unref(cn)('text-xs font-medium leading-none text-mid-gray', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _hoisted_1$f = { class: "flex min-h-screen w-full items-center justify-center bg-canvas p-4 sm:p-6" };
const _hoisted_2$b = { class: "relative mt-1.5" };
const _hoisted_3$b = {
  key: 0,
  class: "text-xs font-medium text-ember",
  role: "alert"
};


const _sfc_main$r = {
  __name: 'LoginPage',
  setup(__props) {

const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const errorMsg = ref('');

onMounted(() => {
  if (isLoggedIn.value) router.replace('/');
});

async function onSubmit() {
  if (submitting.value) return
  errorMsg.value = '';
  if (!username.value.trim() || !password.value) {
    errorMsg.value = '请输入用户名和密码';
    return
  }
  submitting.value = true;
  try {
    await login(username.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect);
  } catch (e) {
    // 统一文案，不区分「用户不存在」与「密码错误」（防账号枚举，PRD §5）
    errorMsg.value = e?.status === 401 ? '用户名或密码错误' : e?.message || '登录失败';
  } finally {
    submitting.value = false;
  }
}

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", _hoisted_1$f, [
    createVNode(_sfc_main$w, { class: "w-full max-w-[400px] p-6 sm:p-8" }, {
      default: withCtx(() => [
        _cache[5] || (_cache[5] = createBaseVNode("h1", { class: "text-center text-[24px] font-semibold leading-tight text-ink sm:text-[30px]" }, " 科应共享账号 ", -1)),
        _cache[6] || (_cache[6] = createBaseVNode("p", { class: "mt-1 text-center text-sm text-mid-gray" }, "账号管理平台", -1)),
        createBaseVNode("form", {
          class: "mt-8 flex flex-col gap-4",
          onSubmit: withModifiers(onSubmit, ["prevent"])
        }, [
          createBaseVNode("div", null, [
            createVNode(_sfc_main$s, { for: "login-username" }, {
              default: withCtx(() => [...(_cache[3] || (_cache[3] = [
                createTextVNode("用户名", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$t, {
              id: "login-username",
              modelValue: username.value,
              "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((username).value = $event)),
              placeholder: "请输入用户名",
              autocomplete: "username",
              class: "mt-1.5"
            }, null, 8, ["modelValue"])
          ]),
          createBaseVNode("div", null, [
            createVNode(_sfc_main$s, { for: "login-password" }, {
              default: withCtx(() => [...(_cache[4] || (_cache[4] = [
                createTextVNode("密码", -1)
              ]))]),
              _: 1
            }),
            createBaseVNode("div", _hoisted_2$b, [
              createVNode(_sfc_main$t, {
                id: "login-password",
                modelValue: password.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = $event => ((password).value = $event)),
                type: showPassword.value ? 'text' : 'password',
                placeholder: "请输入密码",
                autocomplete: "current-password",
                class: "pr-16"
              }, null, 8, ["modelValue", "type"]),
              createBaseVNode("button", {
                type: "button",
                class: "absolute inset-y-0 right-0 flex items-center gap-1 pr-3 text-xs font-medium text-mid-gray transition-colors hover:text-ink",
                onClick: _cache[2] || (_cache[2] = $event => (showPassword.value = !showPassword.value))
              }, [
                (showPassword.value)
                  ? (openBlock(), createBlock(unref(EyeOff), {
                      key: 0,
                      class: "size-4"
                    }))
                  : (openBlock(), createBlock(unref(Eye), {
                      key: 1,
                      class: "size-4"
                    })),
                createTextVNode(" " + toDisplayString(showPassword.value ? '隐藏' : '显示'), 1)
              ])
            ])
          ]),
          (errorMsg.value)
            ? (openBlock(), createElementBlock("p", _hoisted_3$b, toDisplayString(errorMsg.value), 1))
            : createCommentVNode("", true),
          createVNode(_sfc_main$C, {
            type: "submit",
            class: "mt-1 w-full",
            disabled: submitting.value
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(submitting.value ? '登录中…' : '登录'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ], 32),
        _cache[7] || (_cache[7] = createBaseVNode("p", { class: "mt-6 text-center text-xs text-mid-gray" }, "仅限内部员工使用", -1))
      ]),
      _: 1
    })
  ]))
}
}

};

/**
 * 倒计时 mm:ss（§4.2）：tabular-nums，每秒 tick；到 0 触发 `expire`。
 * 每秒 tick 不触发 aria-live（§9.2）。
 */

const _sfc_main$q = {
  __name: 'Countdown',
  props: {
  seconds: { type: Number, default: 0 },
  class: { type: [String, Object, Array], default: undefined },
},
  emits: ['expire'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

const remaining = ref(Math.max(0, Math.floor(props.seconds)));

function format(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const display = computed(() => format(remaining.value));

let timer;

function start() {
  stop();
  timer = window.setInterval(() => {
    if (remaining.value > 0) {
      remaining.value -= 1;
      if (remaining.value === 0) emit('expire');
    }
  }, 1000);
}

function stop() {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

watch(
  () => props.seconds,
  (value) => {
    remaining.value = Math.max(0, Math.floor(value));
    start();
  },
  { immediate: true },
);

onBeforeUnmount(stop);

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("span", {
    class: normalizeClass(unref(cn)('tabular-nums', props.class))
  }, toDisplayString(display.value), 3))
}
}

};

const _hoisted_1$e = { class: "min-w-0 flex-1 truncate rounded-2xl bg-canvas px-3 py-2 text-sm text-ink tabular-nums" };
const _hoisted_2$a = ["aria-label"];
const _hoisted_3$a = ["aria-label"];

const MASK = '••••••••••••';
const REVEAL_TIMEOUT_MS = 30_000;
const COPIED_TIMEOUT_MS = 6_000;

/**
 * 密码遮蔽 / 显示 / 复制（§4.3）。
 * 默认遮蔽；显示后 30s 自动重新遮蔽；复制后 6s 显示「已复制 ✓」。
 * 显示 / 复制动作通过事件上抛（用于审计，不携带密码本体）。
 */

const _sfc_main$p = {
  __name: 'PasswordReveal',
  props: {
  password: { type: String, required: true },
  class: { type: [String, Object, Array], default: undefined },
},
  emits: ['reveal', 'copy'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

const visible = ref(false);
const copied = ref(false);

let maskTimer;
let copyTimer;

function scheduleMask() {
  clearMask();
  maskTimer = window.setTimeout(() => {
    visible.value = false;
  }, REVEAL_TIMEOUT_MS);
}

function clearMask() {
  if (maskTimer !== undefined) {
    window.clearTimeout(maskTimer);
    maskTimer = undefined;
  }
}

function toggle() {
  visible.value = !visible.value;
  if (visible.value) {
    emit('reveal');
    scheduleMask();
  } else {
    clearMask();
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.password);
  } catch {
    // 非安全上下文 / 权限拒绝时静默失败，不打断流程
  }
  copied.value = true;
  emit('copy');
  if (copyTimer !== undefined) window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    copied.value = false;
  }, COPIED_TIMEOUT_MS);
}

watch(
  () => props.password,
  () => {
    visible.value = false;
    clearMask();
  },
);

onBeforeUnmount(() => {
  clearMask();
  if (copyTimer !== undefined) window.clearTimeout(copyTimer);
});

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: normalizeClass(unref(cn)('flex items-center gap-2', props.class))
  }, [
    createBaseVNode("code", _hoisted_1$e, toDisplayString(visible.value ? __props.password : MASK), 1),
    createBaseVNode("button", {
      type: "button",
      class: "inline-flex h-8 shrink-0 items-center gap-1 rounded-2xl border border-hairline bg-transparent px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-alt",
      "aria-label": visible.value ? '隐藏密码' : '显示密码',
      onClick: toggle
    }, [
      (visible.value)
        ? (openBlock(), createBlock(unref(EyeOff), {
            key: 0,
            class: "size-4"
          }))
        : (openBlock(), createBlock(unref(Eye), {
            key: 1,
            class: "size-4"
          })),
      createTextVNode(" " + toDisplayString(visible.value ? '隐藏' : '显示'), 1)
    ], 8, _hoisted_2$a),
    createBaseVNode("button", {
      type: "button",
      class: "inline-flex h-8 shrink-0 items-center gap-1 rounded-2xl border border-hairline bg-transparent px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-alt",
      "aria-label": copied.value ? '已复制' : '复制密码',
      onClick: copy
    }, [
      (copied.value)
        ? (openBlock(), createBlock(unref(Check), {
            key: 0,
            class: "size-4"
          }))
        : (openBlock(), createBlock(unref(Copy), {
            key: 1,
            class: "size-4"
          })),
      createTextVNode(" " + toDisplayString(copied.value ? '已复制' : '复制'), 1)
    ], 8, _hoisted_3$a)
  ], 2))
}
}

};

const _hoisted_1$d = ["aria-valuenow"];

/**
 * 30 分钟使用进度细条（§5.3）：hairline 底 + ink 填充，纯形表达、无颜色语义。
 */

const _sfc_main$o = {
  __name: 'ProgressHairline',
  props: {
  /** 0–100 */
  value: { type: Number, default: 0 },
  class: { type: [String, Object, Array], default: undefined },
},
  setup(__props) {

const props = __props;

const clamped = computed(() => Math.min(100, Math.max(0, props.value)));

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    role: "progressbar",
    "aria-valuenow": Math.round(clamped.value),
    "aria-valuemin": "0",
    "aria-valuemax": "100",
    class: normalizeClass(unref(cn)('h-1 w-full overflow-hidden rounded-full bg-hairline', props.class))
  }, [
    createBaseVNode("div", {
      class: "h-full rounded-full bg-ink transition-[width] duration-300",
      style: normalizeStyle({ width: `${clamped.value}%` })
    }, null, 4)
  ], 10, _hoisted_1$d))
}
}

};

const _sfc_main$n = {
  __name: 'Badge',
  props: {
  /** 黑白四变体（solid / soft / outline / ember-outline） */
  variant: { type: String, default: 'soft' },
  /** 语义色 soft 变体（§4.1），设置后覆盖 variant */
  tone: { type: String, default: null },
  class: { type: [String, Object, Array], default: undefined },
},
  setup(__props) {

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-2xl border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        solid: 'border-transparent bg-ink-soft text-surface-alt',
        soft: 'border-transparent bg-canvas text-ink-soft',
        outline: 'border-hairline bg-transparent text-ink',
        'ember-outline': 'border-ember/60 bg-transparent text-ember',
      },
    },
    defaultVariants: {
      variant: 'soft',
    },
  },
);

const props = __props;

const meta = computed(() => (props.tone ? STATUS_META[props.tone] : null));

const style = computed(() => {
  if (!meta.value) return undefined
  const m = meta.value;
  return {
    backgroundColor: m.softBg,
    color: m.softText,
    // released 走 outline（透明底 + hairline 描边）
    borderColor: m.softBg === 'transparent' ? '#e5e5e5' : 'transparent',
  }
});

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("span", {
    class: normalizeClass(
      unref(cn)(
        'inline-flex items-center gap-1 rounded-2xl border px-2 py-0.5 text-xs font-medium',
        __props.tone ? undefined : unref(badgeVariants)({ variant: __props.variant }),
        props.class,
      )
    ),
    style: normalizeStyle(style.value)
  }, [
    renderSlot(_ctx.$slots, "default", {}, () => [
      createTextVNode(toDisplayString(meta.value?.label), 1)
    ])
  ], 6))
}
}

};

const _hoisted_1$c = { class: "flex flex-col gap-6" };
const _hoisted_2$9 = { class: "flex flex-col gap-3 p-4 sm:p-5" };
const _hoisted_3$9 = { class: "flex flex-col items-start gap-3 p-4 sm:p-5" };
const _hoisted_4$9 = { class: "text-sm text-mid-gray" };
const _hoisted_5$8 = { class: "p-4 sm:p-5" };
const _hoisted_6$8 = { class: "flex flex-wrap items-center justify-between gap-2" };
const _hoisted_7$7 = { class: "mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2" };
const _hoisted_8$6 = { class: "text-[28px] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums sm:text-[32px] lg:text-[36px]" };
const _hoisted_9$6 = { class: "mt-6" };
const _hoisted_10$5 = { class: "flex items-center gap-2" };
const _hoisted_11$5 = { class: "min-w-0 flex-1 truncate rounded-2xl bg-canvas px-3 py-2 text-sm text-ink tabular-nums" };
const _hoisted_12$5 = ["aria-label"];
const _hoisted_13$5 = { class: "mt-6" };
const _hoisted_14$5 = {
  key: 0,
  class: "mt-4 text-xs text-mid-gray"
};
const _hoisted_15$5 = { class: "mt-6 flex flex-col gap-3 sm:flex-row" };
const _hoisted_16$4 = { class: "mt-6 space-y-2 border-t border-hairline pt-5" };
const _hoisted_17$4 = { class: "flex justify-between gap-4 text-sm" };
const _hoisted_18$3 = { class: "text-ink" };
const _hoisted_19$2 = { class: "flex justify-between gap-4 text-sm" };
const _hoisted_20$1 = { class: "tabular-nums text-ink" };
const _hoisted_21$1 = { class: "p-4 sm:p-5" };
const _hoisted_22$1 = { class: "flex flex-col items-start gap-4 p-4 sm:p-5" };

// 进度条满刻度 = 后端下发的无操作超时租期（lease.timeoutSeconds），不再本地硬编码 30 分钟：
// 管理员把超时改为 10 分钟时，进度条必须按 10 分钟满刻度从头递减，而不是显示在旧 30min 刻度的 2/3 处。
// 兜底 1800 仅在后端未返回该字段（旧版本/异常）时使用。
const FALLBACK_TIMEOUT_SECONDS = 1800;


const _sfc_main$m = {
  __name: 'MyAccountPage',
  setup(__props) {

const router = useRouter();

const loading = ref(true);
const error = ref('');
const lease = ref(null);
const account = ref(null);
const releasing = ref(false);
const confirmOpen = ref(false);
const releasePending = ref(false);
const usernameCopied = ref(false);

let usernameCopyTimer;

const accountUsername = computed(() => account.value?.username || lease.value?.accountUsername || '');

async function copyUsername() {
  if (!accountUsername.value) return
  try {
    await navigator.clipboard.writeText(accountUsername.value);
  } catch {
    // 非安全上下文 / 权限拒绝时静默失败
  }
  usernameCopied.value = true;
  if (usernameCopyTimer !== undefined) window.clearTimeout(usernameCopyTimer);
  usernameCopyTimer = window.setTimeout(() => {
    usernameCopied.value = false;
  }, 6000);
}

let pollTimer;

async function load() {
  try {
    const res = await getCurrentLease();
    lease.value = res.lease;
    account.value = res.account;
    error.value = '';
  } catch (e) {
    error.value = e?.message || '服务不可用';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  pollTimer = window.setInterval(load, 10_000);
  window.addEventListener('message', onExtensionAck);
});

onBeforeUnmount(() => {
  window.clearInterval(pollTimer);
  window.removeEventListener('message', onExtensionAck);
  if (usernameCopyTimer !== undefined) window.clearTimeout(usernameCopyTimer);
});

/** 扩展 BIND_ACK 反馈（协议见 apps/extension/src/content/dashboard.js）。 */
function onExtensionAck(event) {
  if (event.source !== window || event.data?.source !== 'scienceing-extension') return
  if (event.data?.type !== 'BIND_ACK') return
  if (event.data.ok) {
    toast({ title: '科应已在新标签页打开', variant: 'success' });
  } else {
    toast({ title: '打开科应失败', description: event.data?.error || '请确认已安装科应账号助手', variant: 'destructive' });
  }
}

const progress = computed(() => {
  if (!lease.value) return 0
  const total = Math.max(1, lease.value.timeoutSeconds ?? FALLBACK_TIMEOUT_SECONDS);
  const remaining = Math.max(0, Math.min(total, lease.value.remainingSeconds ?? 0));
  // 租期已用比例 =（满刻度 - 剩余）/ 满刻度：领取后从 0% 起跑，归零时 100% 自动释放
  return Math.min(100, Math.round(((total - remaining) / total) * 100))
});

function relativeTime(iso) {
  if (!iso) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  return `${Math.floor(seconds / 3600)} 小时前`
}

function onOpenScienceing() {
  const leaseId = lease.value?.id;
  const leaseToken = sessionStorage.getItem('scienceing_lease_token');
  const accountCode = account.value?.code || lease.value?.accountCode;
  if (!leaseId || !leaseToken) {
    toast({ title: '无法打开科应', description: '缺少租约绑定信息，请重新领取账号', variant: 'destructive' });
    return
  }
  // 协议见 apps/extension/src/content/dashboard.js：看板 → 扩展 postMessage BIND_AND_OPEN
  window.postMessage(
    { source: 'scienceing-dashboard', type: 'BIND_AND_OPEN', leaseId, leaseToken, accountCode },
    '*',
  );
  toast({ title: '正在打开科应', description: `${accountCode} 将在新标签页打开` });
}

async function onRelease() {
  if (!lease.value || releasing.value) return
  releasing.value = true;
  try {
    await releaseLease(lease.value.id);
    sessionStorage.removeItem('scienceing_lease_token');
    releasePending.value = true;
    confirmOpen.value = false;
    lease.value = null;
    account.value = null;
    toast({ title: '已提交归还', description: '账号正在回收，密码重置后即可重新领取' });
    // 重定向到首页
    router.push('/');
  } catch (e) {
    toast({ title: e?.message || '归还失败', variant: 'destructive' });
  } finally {
    releasing.value = false;
  }
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(_sfc_main$z, { "content-width": "narrow" }, {
    default: withCtx(() => [
      createBaseVNode("div", _hoisted_1$c, [
        (loading.value)
          ? (openBlock(), createBlock(_sfc_main$w, { key: 0 }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_2$9, [
                  createVNode(_sfc_main$v, { class: "h-3 w-32" }),
                  createVNode(_sfc_main$v, { class: "h-9 w-24" }),
                  createVNode(_sfc_main$v, { class: "h-9 w-full" }),
                  createVNode(_sfc_main$v, { class: "h-9 w-full" })
                ])
              ]),
              _: 1
            }))
          : (error.value)
            ? (openBlock(), createBlock(_sfc_main$w, { key: 1 }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_3$9, [
                    createBaseVNode("p", _hoisted_4$9, toDisplayString(error.value) + "，当前租约信息暂不可用。", 1),
                    createVNode(_sfc_main$C, {
                      variant: "outline",
                      size: "sm",
                      onClick: load
                    }, {
                      default: withCtx(() => [...(_cache[4] || (_cache[4] = [
                        createTextVNode("重试", -1)
                      ]))]),
                      _: 1
                    })
                  ])
                ]),
                _: 1
              }))
            : (lease.value)
              ? (openBlock(), createBlock(_sfc_main$w, { key: 2 }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_5$8, [
                      createBaseVNode("div", _hoisted_6$8, [
                        _cache[5] || (_cache[5] = createBaseVNode("h2", { class: "text-sm font-medium text-mid-gray" }, "已分配科应账号", -1)),
                        createVNode(_sfc_main$x, {
                          status: unref(toStatusKind)(lease.value.status)
                        }, null, 8, ["status"])
                      ]),
                      createBaseVNode("div", _hoisted_7$7, [
                        createBaseVNode("div", _hoisted_8$6, toDisplayString(account.value?.code || lease.value.accountCode), 1),
                        (unref(pluginState).status === 'ready')
                          ? (openBlock(), createBlock(_sfc_main$n, {
                              key: 0,
                              tone: "available"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(" 助手已就绪 · " + toDisplayString(unref(pluginState).version), 1)
                              ]),
                              _: 1
                            }))
                          : createCommentVNode("", true)
                      ]),
                      createBaseVNode("div", _hoisted_9$6, [
                        _cache[6] || (_cache[6] = createBaseVNode("div", { class: "mb-1.5 text-xs font-medium text-mid-gray" }, "科应账号", -1)),
                        createBaseVNode("div", _hoisted_10$5, [
                          createBaseVNode("code", _hoisted_11$5, toDisplayString(accountUsername.value || '—'), 1),
                          createBaseVNode("button", {
                            type: "button",
                            class: "inline-flex h-8 shrink-0 items-center gap-1 rounded-2xl border border-hairline bg-transparent px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-alt",
                            "aria-label": usernameCopied.value ? '已复制' : '复制科应账号',
                            onClick: copyUsername
                          }, [
                            (usernameCopied.value)
                              ? (openBlock(), createBlock(unref(Check), {
                                  key: 0,
                                  class: "size-4"
                                }))
                              : (openBlock(), createBlock(unref(Copy), {
                                  key: 1,
                                  class: "size-4"
                                })),
                            createTextVNode(" " + toDisplayString(usernameCopied.value ? '已复制' : '复制'), 1)
                          ], 8, _hoisted_12$5)
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_13$5, [
                        _cache[7] || (_cache[7] = createBaseVNode("div", { class: "mb-1.5 text-xs font-medium text-mid-gray" }, "密码", -1)),
                        createVNode(_sfc_main$p, {
                          password: account.value?.password || ''
                        }, null, 8, ["password"])
                      ]),
                      (unref(pluginState).status !== 'ready')
                        ? (openBlock(), createElementBlock("p", _hoisted_14$5, [
                            _cache[8] || (_cache[8] = createTextVNode(" 未检测到助手，「打开科应」的自动登录不可用。 ", -1)),
                            createBaseVNode("button", {
                              type: "button",
                              class: "font-medium text-ink underline decoration-hairline underline-offset-2 transition-colors hover:text-mid-gray",
                              onClick: _cache[0] || (_cache[0] = (...args) => (unref(downloadExtensionZip) && unref(downloadExtensionZip)(...args)))
                            }, " 下载助手 ZIP "),
                            _cache[9] || (_cache[9] = createTextVNode(" ，解压后在 Chrome 扩展页开启「开发者模式」→「加载已解压的扩展程序」。 ", -1))
                          ]))
                        : createCommentVNode("", true),
                      createBaseVNode("div", _hoisted_15$5, [
                        createVNode(_sfc_main$C, {
                          class: "flex-1",
                          onClick: onOpenScienceing
                        }, {
                          default: withCtx(() => [...(_cache[10] || (_cache[10] = [
                            createTextVNode("打开科应", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$C, {
                          variant: "outline",
                          class: "flex-1",
                          onClick: _cache[1] || (_cache[1] = $event => (confirmOpen.value = true))
                        }, {
                          default: withCtx(() => [...(_cache[11] || (_cache[11] = [
                            createTextVNode(" 立即归还 ", -1)
                          ]))]),
                          _: 1
                        })
                      ]),
                      createBaseVNode("dl", _hoisted_16$4, [
                        createBaseVNode("div", _hoisted_17$4, [
                          _cache[12] || (_cache[12] = createBaseVNode("dt", { class: "text-mid-gray" }, "最后操作", -1)),
                          createBaseVNode("dd", _hoisted_18$3, toDisplayString(relativeTime(lease.value.lastActivityAt)), 1)
                        ]),
                        createBaseVNode("div", _hoisted_19$2, [
                          _cache[13] || (_cache[13] = createBaseVNode("dt", { class: "text-mid-gray" }, "预计自动释放", -1)),
                          createBaseVNode("dd", _hoisted_20$1, [
                            createVNode(_sfc_main$q, {
                              seconds: lease.value.remainingSeconds ?? 0
                            }, null, 8, ["seconds"])
                          ])
                        ])
                      ]),
                      createVNode(_sfc_main$o, {
                        value: progress.value,
                        class: "mt-4"
                      }, null, 8, ["value"])
                    ])
                  ]),
                  _: 1
                }))
              : (releasePending.value)
                ? (openBlock(), createBlock(_sfc_main$w, { key: 3 }, {
                    default: withCtx(() => [
                      createBaseVNode("div", _hoisted_21$1, [
                        createVNode(_sfc_main$n, { tone: "recycling" }, {
                          default: withCtx(() => [...(_cache[14] || (_cache[14] = [
                            createTextVNode("账号正在回收", -1)
                          ]))]),
                          _: 1
                        }),
                        _cache[15] || (_cache[15] = createBaseVNode("p", { class: "mt-3 text-sm text-mid-gray" }, "密码重置后即可重新领取。", -1))
                      ])
                    ]),
                    _: 1
                  }))
                : (openBlock(), createBlock(_sfc_main$w, { key: 4 }, {
                    default: withCtx(() => [
                      createBaseVNode("div", _hoisted_22$1, [
                        _cache[17] || (_cache[17] = createBaseVNode("h2", { class: "text-base font-semibold text-ink" }, "当前没有使用中的科应账号", -1)),
                        _cache[18] || (_cache[18] = createBaseVNode("p", { class: "text-sm text-mid-gray" }, "领取后即可在此查看账号与密码。", -1)),
                        createVNode(_sfc_main$C, {
                          onClick: _cache[2] || (_cache[2] = $event => (unref(router).push('/')))
                        }, {
                          default: withCtx(() => [...(_cache[16] || (_cache[16] = [
                            createTextVNode("我要使用科应", -1)
                          ]))]),
                          _: 1
                        })
                      ])
                    ]),
                    _: 1
                  }))
      ]),
      createVNode(_sfc_main$B, {
        open: confirmOpen.value,
        "onUpdate:open": _cache[3] || (_cache[3] = $event => ((confirmOpen).value = $event)),
        title: "立即归还",
        description: "归还后将重置密码并退出当前科应会话。",
        destructive: ""
      }, {
        footer: withCtx(({ close }) => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: close
          }, {
            default: withCtx(() => [...(_cache[19] || (_cache[19] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }, 8, ["onClick"]),
          createVNode(_sfc_main$C, {
            variant: "destructive",
            disabled: releasing.value,
            onClick: onRelease
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(releasing.value ? '回收中…' : '确认归还'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        _: 1
      }, 8, ["open"])
    ]),
    _: 1
  }))
}
}

};

const _hoisted_1$b = { class: "flex h-screen w-full overflow-hidden bg-canvas" };
const _hoisted_2$8 = ["aria-hidden", "inert"];
const _hoisted_3$8 = { class: "flex items-start justify-between px-5 pb-4 pt-6" };
const _hoisted_4$8 = {
  class: "flex-1 space-y-1 overflow-y-auto px-3",
  "aria-label": "管理导航"
};
const _hoisted_5$7 = { class: "truncate" };
const _hoisted_6$7 = { class: "border-t border-hairline px-5 py-4 text-xs text-mid-gray" };
const _hoisted_7$6 = { class: "flex item-center justify-between gap-2.5" };
const _hoisted_8$5 = { class: "flex min-w-0 flex-1 flex-col overflow-hidden" };
const _hoisted_9$5 = { class: "flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-canvas px-4 sm:px-6" };
const _hoisted_10$4 = ["aria-expanded"];
const _hoisted_11$4 = {
  class: "min-w-0 flex-1 truncate text-sm",
  "aria-label": "面包屑"
};
const _hoisted_12$4 = { class: "text-ink" };
const _hoisted_13$4 = { class: "flex shrink-0 items-center gap-2 sm:gap-3 cursor-pointer" };
const _hoisted_14$4 = { class: "hidden max-w-[10rem] truncate text-sm text-mid-gray sm:inline" };
const _hoisted_15$4 = { class: "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-paper p-3" };

/** 与 Tailwind 的 lg 断点保持一致 */
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * 管理后台 App Shell（§5.4）
 *
 * 布局与层次（本次优化）：
 * - 整体高度锁定为屏幕高度（h-screen + overflow-hidden）：左侧菜单高度恒等于
 *   屏幕高度且不随页面滚动；右侧 = 头部（左面包屑 / 右账号信息）+ Content。
 * - Content 宽度 = 屏幕宽 - 菜单宽，高度 = 屏幕高 - 头部高；内容超出时仅在
 *   Content 内部纵向滚动，宽度永不超出。
 * - Content：padding 12px、白底（paper），内容自上而下、自左而右排布，不居中；
 *   内部卡片取消边框、仅保留阴影。
 * - 断点 <1024px：侧边栏转为抽屉（fixed + 位移），顶栏出现汉堡按钮。
 * - 助手检测组件（PluginChip）位于侧边栏品牌区，紧邻「科应共享」。
 */

const _sfc_main$l = {
  __name: 'AppShell',
  props: {
  adminName: { type: String, default: 'admin' },
  version: { type: String, default: 'v1.0.0' },
  /** 兼容旧签名：内容栏宽度（新布局下 Content 恒为全宽，此参数仅保留兼容） */
  contentWidth: { type: String, default: 'default' },
},
  emits: ['logout'],
  setup(__props, { emit: __emit }) {

const emit = __emit;

/** 退出登录二次确认弹窗 */
const logoutOpen = ref(false);
function confirmLogout() {
  logoutOpen.value = false;
  emit('logout');
}

const route = useRoute();

/** 移动端抽屉开合状态 */
const drawerOpen = ref(false);

/** 桌面端：侧边栏常驻。用于决定抽屉关闭时是否需要对辅助技术隐藏 */
const isDesktop = ref(false);

let mediaQuery;

function syncViewport(event) {
  isDesktop.value = event.matches;
  if (isDesktop.value) drawerOpen.value = false;
}

onMounted(() => {
  mediaQuery = window.matchMedia(DESKTOP_QUERY);
  isDesktop.value = mediaQuery.matches;
  mediaQuery.addEventListener('change', syncViewport);
  // 布局层启动扩展握手检测（幂等），供侧边栏品牌区的助手状态使用
  detectExtension();
  // 扩展下载包元信息（版本/更新时间），失败不影响固定路径的下载入口
  loadExtensionPackage();
});

onBeforeUnmount(() => mediaQuery?.removeEventListener('change', syncViewport));

// 路由变化后自动收起抽屉，避免遮挡新页面内容
watch(() => route.fullPath, () => {
  drawerOpen.value = false;
});

/**
 * 抽屉关闭且处于移动端时，侧边栏在视觉上不可见——
 * 此时对辅助技术隐藏，避免键盘 Tab 焦点掉进屏幕外区域。
 */
const sidebarHidden = computed(() => !isDesktop.value && !drawerOpen.value);

const navItems = [
  { label: '数据看板', path: '/admin/dashboard' },
  { label: '账号管理', path: '/admin/accounts' },
  { label: '用户管理', path: '/admin/users' },
  { label: '租约记录', path: '/admin/leases' },
  { label: '系统日志', path: '/admin/logs' },
  { label: '系统参数', path: '/admin/settings' },
];

const currentLabel = computed(
  () => navItems.find((item) => item.path === route.path)?.label ?? '管理',
);

function isActive(path) {
  return route.path === path
}

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", _hoisted_1$b, [
    createVNode(Transition, { name: "drawer-fade" }, {
      default: withCtx(() => [
        (drawerOpen.value)
          ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "fixed inset-0 z-30 bg-ink/20 lg:hidden",
              "aria-hidden": "true",
              onClick: _cache[0] || (_cache[0] = $event => (drawerOpen.value = false))
            }))
          : createCommentVNode("", true)
      ]),
      _: 1
    }),
    createBaseVNode("aside", {
      id: "admin-sidebar",
      class: normalizeClass(
        unref(cn)(
          'z-40 flex w-60 max-w-[80vw] shrink-0 flex-col border-r border-hairline bg-surface-alt',
          'fixed inset-y-0 left-0 transition-transform duration-200 ease-out lg:static lg:h-screen lg:translate-x-0',
          drawerOpen.value ? 'translate-x-0 shadow-overlay' : '-translate-x-full',
        )
      ),
      "aria-hidden": sidebarHidden.value ? 'true' : undefined,
      inert: sidebarHidden.value || undefined
    }, [
      createBaseVNode("div", _hoisted_3$8, [
        _cache[6] || (_cache[6] = createBaseVNode("div", { class: "min-w-0" }, [
          createBaseVNode("div", { class: "flex items-baseline gap-2.5" }, [
            createBaseVNode("div", { class: "truncate text-base font-semibold leading-6 text-ink" }, "科应共享"),
            createBaseVNode("div", { class: "mt-0.5 text-xs text-mid-gray" }, "账号管理平台")
          ])
        ], -1)),
        createBaseVNode("button", {
          type: "button",
          class: "-mr-1.5 rounded-2xl p-1.5 text-mid-gray transition-colors hover:bg-canvas hover:text-ink lg:hidden",
          "aria-label": "关闭导航",
          onClick: _cache[1] || (_cache[1] = $event => (drawerOpen.value = false))
        }, [
          createVNode(unref(X), { class: "size-4" })
        ])
      ]),
      createBaseVNode("nav", _hoisted_4$8, [
        (openBlock(), createElementBlock(Fragment, null, renderList(navItems, (item) => {
          return createVNode(unref(RouterLink), {
            key: item.path,
            to: item.path,
            class: normalizeClass(
            unref(cn)(
              'flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm transition-colors',
              isActive(item.path)
                ? 'bg-paper font-medium text-ink shadow-subtle'
                : 'text-mid-gray hover:bg-canvas hover:text-ink',
            )
          ),
            "aria-current": isActive(item.path) ? 'page' : undefined
          }, {
            default: withCtx(() => [
              createBaseVNode("span", {
                class: normalizeClass(
              unref(cn)(
                'size-2 shrink-0 rounded-full',
                isActive(item.path) ? 'bg-ink' : 'border border-hairline',
              )
            ),
                "aria-hidden": "true"
              }, null, 2),
              createBaseVNode("span", _hoisted_5$7, toDisplayString(item.label), 1)
            ]),
            _: 2
          }, 1032, ["to", "class", "aria-current"])
        }), 64))
      ]),
      createBaseVNode("div", _hoisted_6$7, [
        createBaseVNode("div", _hoisted_7$6, [
          createTextVNode(toDisplayString(__props.version) + " ", 1),
          createVNode(_sfc_main$A, {
            state: unref(pluginState).status,
            version: unref(pluginState).version,
            "min-version": unref(pluginState).minimumVersion,
            onDownload: unref(downloadExtensionZip)
          }, null, 8, ["state", "version", "min-version", "onDownload"])
        ])
      ])
    ], 10, _hoisted_2$8),
    createBaseVNode("div", _hoisted_8$5, [
      createBaseVNode("header", _hoisted_9$5, [
        createBaseVNode("button", {
          type: "button",
          class: "-ml-1.5 shrink-0 rounded-2xl p-1.5 text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink lg:hidden",
          "aria-expanded": drawerOpen.value,
          "aria-controls": "admin-sidebar",
          "aria-label": "打开导航",
          onClick: _cache[2] || (_cache[2] = $event => (drawerOpen.value = true))
        }, [
          createVNode(unref(Menu), { class: "size-5" })
        ], 8, _hoisted_10$4),
        createBaseVNode("nav", _hoisted_11$4, [
          _cache[7] || (_cache[7] = createBaseVNode("span", { class: "text-mid-gray" }, "管理", -1)),
          _cache[8] || (_cache[8] = createBaseVNode("span", {
            class: "mx-1 text-mid-gray",
            "aria-hidden": "true"
          }, "/", -1)),
          createBaseVNode("span", _hoisted_12$4, toDisplayString(currentLabel.value), 1)
        ]),
        createBaseVNode("div", _hoisted_13$4, [
          createVNode(unref(RouterLink), {
            to: "/",
            class: "hidden sm:inline-flex"
          }, {
            default: withCtx(() => [...(_cache[9] || (_cache[9] = [
              createBaseVNode("span", { class: "hidden max-w-[10rem] truncate text-sm text-mid-gray sm:inline" }, " 返回账号看板 ", -1)
            ]))]),
            _: 1
          }),
          createBaseVNode("span", _hoisted_14$4, toDisplayString(__props.adminName), 1),
          createBaseVNode("button", {
            type: "button",
            class: "inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-sm font-medium text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink",
            onClick: _cache[3] || (_cache[3] = $event => (logoutOpen.value = true))
          }, [
            createVNode(unref(LogOut), { class: "size-4" }),
            _cache[10] || (_cache[10] = createBaseVNode("span", { class: "hidden sm:inline" }, "退出", -1))
          ])
        ])
      ]),
      createBaseVNode("main", _hoisted_15$4, [
        renderSlot(_ctx.$slots, "default", {}, undefined, true)
      ])
    ]),
    createVNode(_sfc_main$B, {
      open: logoutOpen.value,
      title: "退出登录？",
      description: "退出后将返回登录页，需重新登录才能继续管理账号。",
      "onUpdate:open": _cache[5] || (_cache[5] = (v) => (logoutOpen.value = v))
    }, {
      footer: withCtx(() => [
        createVNode(_sfc_main$C, {
          variant: "outline",
          onClick: _cache[4] || (_cache[4] = $event => (logoutOpen.value = false))
        }, {
          default: withCtx(() => [...(_cache[11] || (_cache[11] = [
            createTextVNode("取消", -1)
          ]))]),
          _: 1
        }),
        createVNode(_sfc_main$C, {
          variant: "default",
          onClick: confirmLogout
        }, {
          default: withCtx(() => [...(_cache[12] || (_cache[12] = [
            createTextVNode("确认退出", -1)
          ]))]),
          _: 1
        })
      ]),
      _: 1
    }, 8, ["open"])
  ]))
}
}

};
const AppShell = /*#__PURE__*/_export_sfc(_sfc_main$l, [['__scopeId',"data-v-274b4c20"]]);

/**
 * 管理后台布局：复用 App Shell（侧边栏 240px + 内容区 canvas），
 * 并注入当前管理员姓名与登出动作。
 */

const _sfc_main$k = {
  __name: 'AdminLayout',
  props: {
  /** 透传给 AppShell：'default' = 1280px，'narrow' = 768px（表单类稀疏页） */
  contentWidth: { type: String, default: 'default' },
},
  setup(__props) {

const router = useRouter();
const adminName = computed(() => authState.user?.displayName || authState.user?.username || 'admin');

async function onLogout() {
  await logout();
  router.replace('/login');
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(AppShell, {
    "admin-name": adminName.value,
    "content-width": __props.contentWidth,
    onLogout: onLogout
  }, {
    default: withCtx(() => [
      renderSlot(_ctx.$slots, "default")
    ]),
    _: 3
  }, 8, ["admin-name", "content-width"]))
}
}

};

const _hoisted_1$a = { class: "rounded-3xl border border-ember/40 bg-status-error-soft p-5" };
const _hoisted_2$7 = { class: "flex items-start gap-3" };
const _hoisted_3$7 = { class: "flex-1" };
const _hoisted_4$7 = { class: "text-sm font-medium text-ember" };
const _hoisted_5$6 = { class: "mt-1 text-sm text-mid-gray" };
const _hoisted_6$6 = { class: "mt-4 flex flex-wrap justify-end gap-2" };

/**
 * 回收失败错误卡片（§5.5 / §6.2）：账号代码 + 错误信息 + 重试 / 人工处理完成。
 * ember 仅用于错误与破坏性语义（§4.1）。
 */

const _sfc_main$j = {
  __name: 'ErrorCard',
  props: {
  accountCode: { type: String, required: true },
  errorText: { type: String, default: '自动回收失败' },
},
  emits: ['retry', 'fix'],
  setup(__props, { emit: __emit }) {

const emit = __emit;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", _hoisted_1$a, [
    createBaseVNode("div", _hoisted_2$7, [
      createVNode(unref(TriangleAlert), { class: "mt-0.5 size-4 shrink-0 text-ember" }),
      createBaseVNode("div", _hoisted_3$7, [
        createBaseVNode("p", _hoisted_4$7, "自动回收失败 · " + toDisplayString(__props.accountCode), 1),
        createBaseVNode("p", _hoisted_5$6, toDisplayString(__props.errorText), 1)
      ])
    ]),
    createBaseVNode("div", _hoisted_6$6, [
      createVNode(_sfc_main$C, {
        variant: "outline",
        size: "sm",
        onClick: _cache[0] || (_cache[0] = $event => (emit('retry')))
      }, {
        default: withCtx(() => [...(_cache[2] || (_cache[2] = [
          createTextVNode("重试", -1)
        ]))]),
        _: 1
      }),
      createVNode(_sfc_main$C, {
        variant: "outline",
        size: "sm",
        onClick: _cache[1] || (_cache[1] = $event => (emit('fix')))
      }, {
        default: withCtx(() => [...(_cache[3] || (_cache[3] = [
          createTextVNode("人工处理完成", -1)
        ]))]),
        _: 1
      })
    ])
  ]))
}
}

};

const _hoisted_1$9 = ["disabled"];
const _hoisted_2$6 = { class: "truncate" };
const _hoisted_3$6 = {
  key: 0,
  class: "absolute z-50 mt-1 w-full min-w-[8rem] rounded-2xl border border-hairline bg-paper p-1 shadow-subtle"
};
const _hoisted_4$6 = ["aria-selected", "onClick"];

/**
 * 下拉选择（§6.1）：18px、#f5f5f5 填充。
 * options: [{ value, label, disabled? }]
 */

const _sfc_main$i = {
  __name: 'Select',
  props: {
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  disabled: { type: Boolean, default: false },
  class: { type: [String, Object, Array], default: undefined },
},
  emits: ['update:modelValue'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

const open = ref(false);
const rootRef = ref(null);

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? props.placeholder,
);

function toggle() {
  if (props.disabled) return
  open.value = !open.value;
}

function select(option) {
  if (option.disabled) return
  emit('update:modelValue', option.value);
  open.value = false;
}

function onClickOutside(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside));

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    ref_key: "rootRef",
    ref: rootRef,
    class: "relative"
  }, [
    createBaseVNode("button", {
      type: "button",
      disabled: __props.disabled,
      class: normalizeClass(
        unref(cn)(
          'flex h-9 w-full items-center justify-between gap-2 rounded-2xl border border-transparent bg-canvas px-3 text-sm text-ink focus:border-hairline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          props.class,
        )
      ),
      onClick: toggle
    }, [
      createBaseVNode("span", _hoisted_2$6, toDisplayString(selectedLabel.value), 1),
      createVNode(unref(ChevronDown), {
        class: normalizeClass(unref(cn)('size-4 shrink-0 text-mid-gray transition-transform', open.value && 'rotate-180'))
      }, null, 8, ["class"])
    ], 10, _hoisted_1$9),
    (open.value)
      ? (openBlock(), createElementBlock("div", _hoisted_3$6, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(__props.options, (option) => {
            return (openBlock(), createElementBlock("div", {
              key: option.value,
              role: "option",
              "aria-selected": option.value === __props.modelValue,
              class: normalizeClass(
          unref(cn)(
            'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm',
            option.value === __props.modelValue ? 'font-medium text-ink' : 'text-mid-gray',
            'hover:bg-surface-alt',
            option.disabled && 'cursor-not-allowed opacity-50',
          )
        ),
              onClick: $event => (select(option))
            }, [
              createBaseVNode("span", null, toDisplayString(option.label), 1),
              (option.value === __props.modelValue)
                ? (openBlock(), createBlock(unref(Check), {
                    key: 0,
                    class: "size-4 shrink-0 text-ink"
                  }))
                : createCommentVNode("", true)
            ], 10, _hoisted_4$6))
          }), 128))
        ]))
      : createCommentVNode("", true)
  ], 512))
}
}

};

const _hoisted_1$8 = { class: "table-scroll" };

/**
 * 表格容器
 *
 * 响应式（本次优化）：
 * - 外层 .table-scroll 把横向溢出严格限制在卡片内部，页面本身永不出现横向滚动条；
 * - min-w 通过 prop 传入，让各页面按列数声明「舒适最小宽度」：宽于它时列宽自适应，
 *   窄于它时表格内部滚动，而不是把单元格压成一团。
 */

const _sfc_main$h = {
  __name: 'Table',
  props: {
  class: { type: [String, Object, Array], default: undefined },
  /** 表格舒适最小宽度（Tailwind 类，如 'min-w-[720px]'） */
  minWidth: { type: String, default: '' },
},
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", _hoisted_1$8, [
    createBaseVNode("table", {
      class: normalizeClass(unref(cn)('w-full caption-bottom text-sm', props.minWidth, props.class))
    }, [
      renderSlot(_ctx.$slots, "default")
    ], 2)
  ]))
}
}

};

const _sfc_main$g = {
  __name: 'TableBody',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("tbody", {
    class: normalizeClass(unref(cn)('[&_tr:last-child]:border-0', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$f = {
  __name: 'TableCell',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("td", {
    class: normalizeClass(unref(cn)('px-2 py-2.5 align-middle text-sm text-ink sm:px-3', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$e = {
  __name: 'TableHead',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("th", {
    class: normalizeClass(
      unref(cn)(
        'h-10 whitespace-nowrap px-2 text-left align-middle text-xs font-medium text-mid-gray sm:px-3',
        props.class,
      )
    )
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$d = {
  __name: 'TableHeader',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("thead", {
    class: normalizeClass(
      unref(cn)('surface-band [&_tr]:border-b-0 [&_tr]:border-t-0', props.class)
    )
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$c = {
  __name: 'TableRow',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("tr", {
    class: normalizeClass(unref(cn)('border-b border-hairline transition-colors hover:bg-surface-alt/60', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

/**
 * 极简 CSV 解析（RFC 4180 子集）：
 * - 支持双引号包裹字段、字段内逗号、双引号转义（"" → "）；
 * - 兼容 \r\n / \n 换行；
 * - 首行为表头，支持中英文列名（用户名/姓名/部门/角色/密码 或
 *   username/displayName/department/role/password）。
 */

/** 去除 BOM + 按行切分（引号内的换行已在上一步处理，这里简单 split 即可） */
function splitRows(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/)
}

/** 解析单行（含引号字段），返回字段数组；行列数不齐时由调用方兜底 */
function parseLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim())
}

/**
 * CSV 文本 → 二维字符串矩阵（去掉空行）。供 parse*Rows 使用；
 * XLSX 文件经 SheetJS 归一为同样形状的矩阵后走同一套校验（见 lib/spreadsheet.js）。
 */
function csvTextToMatrix(text) {
  const lines = splitRows(text ?? '');
  return lines.filter((line) => line.trim() !== '').map(parseLine)
}

/** 单元格归一化：任意输入 → 去首尾空白的字符串（数字/日期等由 SheetJS raw:false 先行转串） */
function normalizeCells(row) {
  return (row || []).map((cell) => String(cell ?? '').trim())
}

const HEADER_ALIASES = {
  username: ['username', '用户名', '账号', '登录名'],
  displayName: ['displayname', 'display_name', '姓名', '名称', '名字'],
  department: ['department', '部门'],
  role: ['role', '角色'],
  password: ['password', '密码', '初始密码'],
};

/** 表头 → 字段名映射；返回 null 表示无法识别该列 */
function mapHeader(cell) {
  const key = String(cell ?? '').trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field
  }
  return null
}

const VALID_ROLES = new Set(['USER', 'ADMIN']);

/**
 * 解析用户表格（二维矩阵，首行为表头）→ 行对象。
 * 返回 { rows: [{ index, username, displayName, department, role, password, errors: [] }], headerErrors: [] }
 * rows 中每行带 errors（空数组 = 合法行），供预览弹窗标记问题行。
 * CSV 与 XLSX 两种来源都归一为矩阵后调用本函数，保证行为一致。
 */
function parseUsersRows(matrix) {
  const norm = (matrix || []).map(normalizeCells);
  if (norm.length === 0) return { rows: [], headerErrors: ['文件为空'] }

  const headers = norm[0].map(mapHeader);
  const headerErrors = [];
  for (const required of ['username', 'displayName', 'password']) {
    if (!headers.includes(required)) {
      headerErrors.push(`缺少必需列：${HEADER_ALIASES[required][0]}`);
    }
  }

  const rows = [];
  for (let i = 1; i < norm.length; i += 1) {
    const cells = norm[i];
    const record = { username: '', displayName: '', department: '', role: 'USER', password: '' };
    headers.forEach((field, col) => {
      if (field && cells[col] !== undefined) record[field] = cells[col];
    });

    // 行级校验必须无条件执行：早期实现用 `if (headerErrors.length === 0)` 把它短路掉，
    // 导致表头缺列时每一行都被误标为「✓ 可导入」并放行提交，后端再逐行拒绝，
    // 用户看到的预览与结果完全对不上（导入流程不闭环）。缺列会让对应字段为空串，
    // 下面的必填校验自然会给出行级错误，无需依赖 headerErrors 判断。
    const errors = [];
    if (!record.username) errors.push('用户名为空');
    if (!record.displayName) errors.push('姓名为空');
    if (!record.password) errors.push('密码为空');
    const role = (record.role || 'USER').toUpperCase();
    if (!VALID_ROLES.has(role)) errors.push(`角色必须是 USER 或 ADMIN（当前「${record.role}」）`);

    rows.push({
      index: i,
      username: record.username,
      displayName: record.displayName,
      department: record.department || '',
      role: (record.role || 'USER').toUpperCase(),
      password: record.password,
      errors,
    });
  }

  // 批内用户名重复：第二次及以后出现的行标记为不可导入（首个仍可导入）
  const seen = new Set();
  for (const row of rows) {
    if (!row.username) continue
    if (seen.has(row.username)) {
      row.errors.push('批内用户名重复');
    } else {
      seen.add(row.username);
    }
  }

  return { rows, headerErrors }
}

/**
 * 生成示例 CSV（供「下载模板」使用）。
 */
function usersCsvTemplate() {
  return ['用户名,姓名,部门,角色,密码', 'zhangsan,张三,研发部,USER,初始密码123', 'lisi,李四,产品部,USER,初始密码456'].join('\r\n')
}

// ---------------------------------------------------------------------------
// 科应账号 CSV（新增 / 导入）：仅需 账号编号(code) + 科应账号(username)。
// 密码由系统以占位密文托管，管理员后续经「重置密码」流程生成真实密码。
// ---------------------------------------------------------------------------

const ACCOUNT_HEADER_ALIASES = {
  code: ['code', '账号编号', '编号', '账号码', '账号'],
  username: ['username', '科应账号', '账号名', '登录名', '名称'],
};

function mapAccountHeader(cell) {
  const key = String(cell ?? '').trim().toLowerCase();
  for (const [field, aliases] of Object.entries(ACCOUNT_HEADER_ALIASES)) {
    if (aliases.includes(key)) return field
  }
  return null
}

/** 与后端 admin.service.createAccount 的校验保持一致，提前拦截非法编号，避免导入后才被逐行拒绝。 */
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * 解析科应账号表格（二维矩阵，首行为表头）→ 行对象。
 * 返回 { rows: [{ index, code, username, errors: [] }], headerErrors: [] }
 * 必需列：code、username。批内 code 重复的行标记为不可导入。
 */
function parseAccountsRows(matrix) {
  const norm = (matrix || []).map(normalizeCells);
  if (norm.length === 0) return { rows: [], headerErrors: ['文件为空'] }

  const headers = norm[0].map(mapAccountHeader);
  const headerErrors = [];
  for (const required of ['code', 'username']) {
    if (!headers.includes(required)) {
      headerErrors.push(`缺少必需列：${ACCOUNT_HEADER_ALIASES[required][0]}`);
    }
  }

  const rows = [];
  for (let i = 1; i < norm.length; i += 1) {
    const cells = norm[i];
    const record = { code: '', username: '' };
    headers.forEach((field, col) => {
      if (field && cells[col] !== undefined) record[field] = cells[col];
    });

    // 同上：行级校验无条件执行，缺列时由必填校验给出行级错误。
    const errors = [];
    if (!record.code) errors.push('账号编号为空');
    if (!record.username) errors.push('科应账号为空');
    if (record.code && !CODE_PATTERN.test(record.code)) {
      errors.push('账号编号仅允许字母、数字、- 和 _');
    }

    rows.push({ index: i, code: record.code, username: record.username, errors });
  }

  // 批内 code 重复：第二次及以后出现的行标记为不可导入
  const seen = new Set();
  for (const row of rows) {
    if (!row.code) continue
    if (seen.has(row.code)) {
      row.errors.push('批内账号编号重复');
    } else {
      seen.add(row.code);
    }
  }

  return { rows, headerErrors }
}

/** 生成账号导入示例 CSV（供「下载模板」使用）。 */
function accountsCsvTemplate() {
  return ['账号编号,科应账号', 'KY-11,ky-11', 'KY-12,ky-12'].join('\r\n')
}

/** 支持的扩展名与 <input accept> 值。.xlsm（启用宏的 xlsx）与旧版 .xls（BIFF）官方库同样支持。 */
const SPREADSHEET_EXTENSIONS = ['.csv', '.xlsx', '.xlsm', '.xls'];
const SPREADSHEET_ACCEPT =
  '.csv,.xlsx,.xlsm,.xls,text/csv,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel';

const SHEETJS_CHUNK = () => __vitePreload(() => import('./xlsx-BaPmvHOu.js'),true              ?[]:void 0);

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : ''
}

/** 判断文件名是否为受支持的表格文件。 */
function isSpreadsheetFile(name) {
  return SPREADSHEET_EXTENSIONS.includes('.' + extOf(name))
}

/** 判断是否 XLSX 家族（需 SheetJS；.csv 走文本解析）。 */
function isWorkbook(name) {
  return ['.xlsx', '.xlsm', '.xls'].includes('.' + extOf(name))
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    // xlsx 走 arrayBuffer；csv 按 utf-8 读文本。Excel 另存的 CSV 若是 GBK，utf-8 会乱码——
    // 属已知边界：提示用户另存为 UTF-8 CSV 或改用 xlsx。
    reader.readAsText(file, 'utf-8');
  })
}

/** 读取工作簿首个工作表 → 二维字符串矩阵（SheetJS 懒加载，仅首次选择 xlsx 时下载）。 */
async function workbookToMatrix(file) {
  const XLSX = await SHEETJS_CHUNK();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const name = wb.SheetNames?.[0];
  if (!name) throw new Error('文件中没有可读取的工作表')
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1, // 输出二维数组，首行为表头
    defval: '', // 空单元格统一补空串
    raw: false, // 取格式化文本：数字 12345 → '12345'，日期 → 显示文本（对齐 CSV 的全字符串语义）
    blankrows: false, // 跳过整行空白
  });
  return matrix
}

/**
 * 读取表格文件 → 二维字符串矩阵（首行为表头行）。
 * 不支持的扩展名抛错，由调用方转为用户提示。
 */
async function fileToMatrix(file) {
  if (!file) throw new Error('未选择文件')
  if (!isSpreadsheetFile(file.name)) {
    throw new Error(`不支持的文件类型，请选择 ${SPREADSHEET_EXTENSIONS.join(' / ')}`)
  }
  if (isWorkbook(file.name)) return workbookToMatrix(file)
  return csvTextToMatrix(await readAsText(file))
}

/** 解析用户表格文件（CSV / XLSX）→ { rows, headerErrors }。 */
function parseUsersFile(file) {
  return fileToMatrix(file).then(parseUsersRows)
}

/** 解析科应账号表格文件（CSV / XLSX）→ { rows, headerErrors }。 */
function parseAccountsFile(file) {
  return fileToMatrix(file).then(parseAccountsRows)
}

/**
 * 生成工作簿二进制（供「下载 xlsx 模板」）。aoa = 二维字符串数组。
 * 与解析共用同一份 vendored SheetJS（懒加载），确保下载的模板一定能被本系统读回。
 */
async function aoaToWorkbookBytes(aoa, sheetName = 'Sheet1') {
  const XLSX = await SHEETJS_CHUNK();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

const _hoisted_1$7 = { class: "flex flex-col gap-6" };
const _hoisted_2$5 = { class: "flex flex-wrap items-center justify-between gap-3" };
const _hoisted_3$5 = { class: "flex flex-wrap items-center gap-2" };
const _hoisted_4$5 = {
  key: 0,
  class: "flex flex-col gap-3"
};
const _hoisted_5$5 = { class: "flex items-center gap-2" };
const _hoisted_6$5 = { class: "text-mid-gray" };
const _hoisted_7$5 = { class: "flex items-center gap-2" };
const _hoisted_8$4 = {
  key: 0,
  class: "cursor-help whitespace-nowrap rounded-full border border-hairline px-2 py-0.5 text-xs text-mid-gray",
  title: "密码尚未初始化（seed / 导入占位）。请先执行「重置密码」在科应后台生成真实密码，否则该账号无法被领用。"
};
const _hoisted_9$4 = { class: "flex items-center justify-end gap-2 whitespace-nowrap" };
const _hoisted_10$3 = {
  key: 0,
  class: "text-xs text-mid-gray"
};
const _hoisted_11$3 = ["onClick"];
const _hoisted_12$3 = {
  key: 0,
  class: "flex flex-col gap-2"
};
const _hoisted_13$3 = { class: "space-y-3" };
const _hoisted_14$3 = { class: "space-y-3" };
const _hoisted_15$3 = { class: "flex flex-wrap items-center gap-2" };
const _hoisted_16$3 = ["accept"];
const _hoisted_17$3 = { class: "max-h-48 overflow-auto rounded-lg border border-hairline" };
const _hoisted_18$2 = { class: "font-medium" };
const _hoisted_19$1 = { class: "text-mid-gray" };
const _hoisted_20 = { class: "font-medium" };
const _hoisted_21 = { class: "text-mid-gray" };
const _hoisted_22 = { class: "text-ember" };
const _hoisted_23 = {
  key: 1,
  class: "text-xs text-mid-gray"
};

const XLSX_MIME$1 = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** 科应账号表格模板（CSV / XLSX 共用列名约定）。 */

const _sfc_main$b = {
  __name: 'AccountsPage',
  setup(__props) {

const ACCOUNT_TEMPLATE_AOA = [
  ['账号编号', '科应账号'],
  ['KY-11', 'ky-11'],
  ['KY-12', 'ky-12'],
];

const loading = ref(true);
const error = ref('');
const accounts = ref([]);
const pending = ref(false);
const dialog = ref(null); // { type, account }

// 改名表单（Bug1：支持修改账号名称，对应科应平台账号）
const renameOpen = ref(false);
const renameTarget = ref(null);
const renameValue = ref('');

// 重置密码时选中的账号 id（默认为点击行，可切换）
const resetTargetId = ref(null);
const resetTarget = computed(() => accounts.value.find((a) => a.id === resetTargetId.value) ?? null);

const errorAccounts = computed(() => accounts.value.filter((a) => a.status === 'ERROR'));

// ---------------------------------------------------------------------------
// 新增账号 / 删除账号 / CSV 导入（从首页账号池迁移至本页，功能一致）
// ---------------------------------------------------------------------------
const createOpen = ref(false);
const createForm = ref({ code: '', username: '' });

const deleteTarget = ref(null);
const deleteOpen = ref(false);
function confirmDelete(account) {
  deleteTarget.value = account;
  deleteOpen.value = true;
}
async function doDelete() {
  if (!deleteTarget.value?.id) return
  pending.value = true;
  try {
    await deleteAccount(deleteTarget.value.id);
    toast({ title: `已删除 ${deleteTarget.value.code}`, variant: 'success' });
    deleteOpen.value = false;
    load();
  } catch (e) {
    toast({ title: e?.message || '删除失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

async function saveCreate() {
  if (!createForm.value.code.trim() || !createForm.value.username.trim()) return
  pending.value = true;
  try {
    await createAccount({ code: createForm.value.code.trim(), username: createForm.value.username.trim() });
    toast({ title: `已新增 ${createForm.value.code}`, variant: 'success' });
    createOpen.value = false;
    createForm.value = { code: '', username: '' };
    load();
  } catch (e) {
    toast({ title: e?.message || '新增失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

// CSV / XLSX 导入（解析交互与用户导入一致：上传 → 预览 → 二次确认）
const importOpen = ref(false);
const importFileRef = ref(null);
const importRows = ref([]);
const importFailed = ref([]);
const importResult = ref(null); // { created, failedCount } —— 非空表示本轮已出结果，禁止重复提交

/** 触发浏览器下载（a 需入 DOM 且延后 revoke，否则部分浏览器会中断下载）。data 为字符串(CSV)或字节(XLSX)。 */
function downloadBlob(filename, data, type) {
  const isBinary = typeof data !== 'string';
  const blob = isBinary
    ? new Blob([data], { type })
    : new Blob(['\uFEFF' + data], { type: type || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onImportDialogToggle(open) {
  importOpen.value = open;
  if (!open) {
    importRows.value = [];
    importFailed.value = [];
    importResult.value = null;
  }
}

function triggerImportFile() {
  importFileRef.value?.click();
}
function downloadAccountTemplate() {
  downloadBlob('科应账号导入模板.csv', accountsCsvTemplate());
}

/** 下载 xlsx 模板：与解析共用同一份 vendored SheetJS 生成，保证读得回。 */
async function downloadAccountXlsxTemplate() {
  try {
    const bytes = await aoaToWorkbookBytes(ACCOUNT_TEMPLATE_AOA, '账号模板');
    downloadBlob('科应账号导入模板.xlsx', bytes, XLSX_MIME$1);
  } catch (e) {
    toast({ title: e?.message || '模板生成失败', variant: 'destructive' });
  }
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return
  if (!isSpreadsheetFile(file.name)) {
    toast({ title: `仅支持 ${SPREADSHEET_EXTENSIONS.join(' / ')} 文件`, variant: 'destructive' });
    return
  }
  // 重新选文件即开启新一轮：清掉上一轮结果，避免新旧预览/结果混在一起
  importResult.value = null;
  let result;
  try {
    result = await parseAccountsFile(file);
  } catch (err) {
    toast({ title: err?.message || '文件解析失败', variant: 'destructive' });
    return
  }
  const { rows, headerErrors } = result;
  if (headerErrors.length) {
    toast({ title: headerErrors.join('；'), variant: 'destructive' });
    importRows.value = [];
    importFailed.value = [];
  } else {
    importRows.value = rows
      .filter((r) => r.errors.length === 0)
      .map((r) => ({ index: r.index, code: r.code, username: r.username }));
    importFailed.value = rows
      .filter((r) => r.errors.length > 0)
      .map((r) => ({ index: r.index, code: r.code, username: r.username, errors: r.errors }));
  }
}

async function confirmImport() {
  if (importResult.value || importRows.value.length === 0) return
  pending.value = true;
  try {
    const res = await bulkCreateAccounts(importRows.value.map((r) => ({ code: r.code, username: r.username })));
    const created = res?.created ?? 0;
    const failed = res?.failed ?? [];
    toast({
      title: `已导入 ${created} 条${failed.length ? `，${failed.length} 条失败` : ''}`,
      description: created > 0 ? '导入账号的密码为系统占位值，请执行「重置密码」生成真实密码后方可领用。' : undefined,
      variant: failed.length ? 'default' : 'success',
    });
    // 把后端失败原因回写到明细列表，成功行从待导入列表移除，杜绝重复提交
    const failedReason = new Map(failed.map((f) => [f.code, f.reason]));
    importFailed.value = [
      ...importFailed.value.filter((r) => !failedReason.has(r.code)),
      ...importRows.value
        .filter((r) => failedReason.has(r.code))
        .map((r) => ({ index: r.index, code: r.code, username: r.username, errors: [failedReason.get(r.code)] })),
    ];
    importRows.value = [];
    importResult.value = { created, failedCount: failed.length };
    load();
    // 全部成功才自动关闭；有失败时保留弹窗展示明细（提交按钮此时已隐藏）
    if (failed.length === 0) importOpen.value = false;
  } catch (e) {
    toast({ title: e?.message || '导入失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

async function load() {
  try {
    accounts.value = await getAdminAccounts();
    error.value = '';
  } catch (e) {
    error.value = e?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`
}

const dialogMeta = computed(() => {
  if (!dialog.value) return null
  // 将重置 {{ resetTarget.code }}（{{ resetTarget.username }}）的密码并回收其活动租约。
  const { type, account } = dialog.value;
  if (type === 'force-release') {
    return { title: `强制回收 ${account.code}`, description: '将重置密码并立即退出当前使用人的科应会话。', destructive: true, confirm: '确认回收' }
  }
  if (type === 'reset-password') {
    return { title: '重置密码', description: '', destructive: false, confirm: '确认重置' }
  }
  if (type === 'disable') {
    return { title: `禁用账号 ${account.code}`, description: '禁用后该账号不可再被领取；若有活动租约将一并回收。', destructive: true, confirm: '确认禁用' }
  }
  if (type === 'mark-available') {
    return { title: `标记可用 ${account.code}`, description: '确认人工处理已完成，账号将回到可用状态。', destructive: false, confirm: '确认' }
  }
  if (type === 'enable') {
    return { title: `启用账号 ${account.code}`, description: '启用后该账号可被重新领取。', destructive: false, confirm: '确认启用' }
  }
  return null
});

function openDialog(type, account) {
  dialog.value = { type, account };
  if (type === 'reset-password') resetTargetId.value = account.id;
}

function openRename(account) {
  renameTarget.value = account;
  renameValue.value = account.username;
  renameOpen.value = true;
}

async function onRenameSubmit() {
  const name = renameValue.value.trim();
  if (!name) {
    toast({ title: '账号名称不能为空', variant: 'destructive' });
    return
  }
  pending.value = true;
  try {
    await renameAccount(renameTarget.value.id, { username: name });
    toast({ title: '账号名称已更新', description: `${renameTarget.value.code} → ${name}`, variant: 'success' });
    renameOpen.value = false;
    load();
  } catch (e) {
    toast({ title: e?.message || '修改失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

async function onConfirm() {
  const { type } = dialog.value;
  pending.value = true;
  try {
    if (type === 'force-release') await forceRelease(dialog.value.account.id);
    else if (type === 'reset-password') await resetPassword(resetTargetId.value);
    else if (type === 'disable') await disableAccount(dialog.value.account.id);
    else if (type === 'mark-available') await markAvailable(dialog.value.account.id);
    else if (type === 'enable') await enableAccount(dialog.value.account.id);
    toast({ title: '操作已提交', description: '状态已更新', variant: 'success' });
    dialog.value = null;
    load();
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

function onRetry(account) {
  openDialog('reset-password', account);
}

async function onFix(account) {
  pending.value = true;
  try {
    await markAvailable(account.id);
    toast({ title: `${account.code} 已标记可用`, variant: 'success' });
    load();
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(_sfc_main$k, null, {
    default: withCtx(() => [
      createBaseVNode("div", _hoisted_1$7, [
        createBaseVNode("div", _hoisted_2$5, [
          _cache[16] || (_cache[16] = createBaseVNode("h1", { class: "text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8" }, " 科应账号管理 ", -1)),
          createBaseVNode("div", _hoisted_3$5, [
            createVNode(_sfc_main$C, {
              variant: "outline",
              onClick: _cache[0] || (_cache[0] = $event => (importOpen.value = true))
            }, {
              default: withCtx(() => [...(_cache[14] || (_cache[14] = [
                createTextVNode("导入表格", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, {
              onClick: _cache[1] || (_cache[1] = $event => (createOpen.value = true))
            }, {
              default: withCtx(() => [...(_cache[15] || (_cache[15] = [
                createTextVNode("新增账号", -1)
              ]))]),
              _: 1
            })
          ])
        ]),
        (errorAccounts.value.length)
          ? (openBlock(), createElementBlock("div", _hoisted_4$5, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(errorAccounts.value, (account) => {
                return (openBlock(), createBlock(_sfc_main$j, {
                  key: account.id,
                  "account-code": account.code,
                  "error-text": "改密失败：科应后台未能完成重置（Worker 已自动重试），可重试；若已人工处理完成请标记可用。",
                  onRetry: $event => (onRetry(account)),
                  onFix: $event => (onFix(account))
                }, null, 8, ["account-code", "onRetry", "onFix"]))
              }), 128))
            ]))
          : createCommentVNode("", true),
        createVNode(_sfc_main$w, { class: "overflow-hidden" }, {
          default: withCtx(() => [
            createVNode(_sfc_main$h, { "min-width": "min-w-[980px]" }, {
              default: withCtx(() => [
                createVNode(_sfc_main$d, null, {
                  default: withCtx(() => [
                    createVNode(_sfc_main$c, null, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[17] || (_cache[17] = [
                            createTextVNode("账号", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[18] || (_cache[18] = [
                            createTextVNode("科应账号", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[19] || (_cache[19] = [
                            createTextVNode("状态", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[20] || (_cache[20] = [
                            createTextVNode("使用者", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[21] || (_cache[21] = [
                            createTextVNode("最后改密", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, { class: "text-right" }, {
                          default: withCtx(() => [...(_cache[22] || (_cache[22] = [
                            createTextVNode("操作", -1)
                          ]))]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                createVNode(_sfc_main$g, null, {
                  default: withCtx(() => [
                    (loading.value)
                      ? (openBlock(), createElementBlock(Fragment, { key: 0 }, renderList(5, (i) => {
                          return createVNode(_sfc_main$c, { key: i }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, { colspan: "6" }, {
                                default: withCtx(() => [
                                  createVNode(_sfc_main$v, { class: "h-6 w-full" })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        }), 64))
                      : (error.value)
                        ? (openBlock(), createBlock(_sfc_main$c, { key: 1 }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, {
                                colspan: "6",
                                class: "py-6 text-center text-mid-gray"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(error.value) + " ", 1),
                                  createVNode(_sfc_main$C, {
                                    variant: "outline",
                                    size: "sm",
                                    class: "ml-3",
                                    onClick: load
                                  }, {
                                    default: withCtx(() => [...(_cache[23] || (_cache[23] = [
                                      createTextVNode("重试", -1)
                                    ]))]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }))
                        : (openBlock(true), createElementBlock(Fragment, { key: 2 }, renderList(accounts.value, (account) => {
                            return (openBlock(), createBlock(_sfc_main$c, {
                              key: account.id,
                              class: normalizeClass(!account.enabled && 'opacity-50')
                            }, {
                              default: withCtx(() => [
                                createVNode(_sfc_main$f, { class: "font-medium tabular-nums" }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(account.code), 1)
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, null, {
                                  default: withCtx(() => [
                                    createBaseVNode("div", _hoisted_5$5, [
                                      createBaseVNode("span", _hoisted_6$5, toDisplayString(account.username), 1)
                                    ])
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, null, {
                                  default: withCtx(() => [
                                    createBaseVNode("div", _hoisted_7$5, [
                                      createVNode(_sfc_main$n, {
                                        tone: unref(toStatusKind)(account.status)
                                      }, null, 8, ["tone"]),
                                      (!account.passwordProvisioned)
                                        ? (openBlock(), createElementBlock("span", _hoisted_8$4, " 待改密 "))
                                        : createCommentVNode("", true)
                                    ])
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, {
                                  class: normalizeClass(account.currentUser ? 'text-ink' : 'text-mid-gray')
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(account.currentUser || '—'), 1)
                                  ]),
                                  _: 2
                                }, 1032, ["class"]),
                                createVNode(_sfc_main$f, { class: "tabular-nums text-mid-gray" }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(formatDate(account.lastPasswordChangedAt)), 1)
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, null, {
                                  default: withCtx(() => [
                                    createBaseVNode("div", _hoisted_9$4, [
                                      (account.status === 'RECYCLING')
                                        ? (openBlock(), createElementBlock("span", _hoisted_10$3, "—"))
                                        : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                                            (account.status === 'IN_USE')
                                              ? (openBlock(), createBlock(_sfc_main$C, {
                                                  key: 0,
                                                  variant: "destructive",
                                                  size: "sm",
                                                  onClick: $event => (openDialog('force-release', account))
                                                }, {
                                                  default: withCtx(() => [...(_cache[24] || (_cache[24] = [
                                                    createTextVNode(" 强制回收 ", -1)
                                                  ]))]),
                                                  _: 1
                                                }, 8, ["onClick"]))
                                              : createCommentVNode("", true),
                                            (account.status !== 'RECYCLING')
                                              ? (openBlock(), createBlock(_sfc_main$C, {
                                                  key: 1,
                                                  variant: "ghost",
                                                  size: "sm",
                                                  onClick: $event => (openDialog('reset-password', account))
                                                }, {
                                                  default: withCtx(() => [...(_cache[25] || (_cache[25] = [
                                                    createTextVNode(" 重置密码 ", -1)
                                                  ]))]),
                                                  _: 1
                                                }, 8, ["onClick"]))
                                              : createCommentVNode("", true),
                                            (account.status === 'ERROR')
                                              ? (openBlock(), createBlock(_sfc_main$C, {
                                                  key: 2,
                                                  variant: "ghost",
                                                  size: "sm",
                                                  onClick: $event => (openDialog('mark-available', account))
                                                }, {
                                                  default: withCtx(() => [...(_cache[26] || (_cache[26] = [
                                                    createTextVNode(" 标记可用 ", -1)
                                                  ]))]),
                                                  _: 1
                                                }, 8, ["onClick"]))
                                              : createCommentVNode("", true),
                                            createBaseVNode("button", {
                                              variant: "ghost",
                                              size: "sm",
                                              onClick: $event => (openRename(account))
                                            }, " 编辑 ", 8, _hoisted_11$3),
                                            (account.enabled)
                                              ? (openBlock(), createBlock(_sfc_main$C, {
                                                  key: 3,
                                                  variant: "ghost",
                                                  size: "sm",
                                                  class: "text-ember hover:bg-status-error-soft hover:text-ember",
                                                  onClick: $event => (openDialog('disable', account))
                                                }, {
                                                  default: withCtx(() => [...(_cache[27] || (_cache[27] = [
                                                    createTextVNode(" 禁用 ", -1)
                                                  ]))]),
                                                  _: 1
                                                }, 8, ["onClick"]))
                                              : (openBlock(), createBlock(_sfc_main$C, {
                                                  key: 4,
                                                  variant: "ghost",
                                                  size: "sm",
                                                  onClick: $event => (openDialog('enable', account))
                                                }, {
                                                  default: withCtx(() => [...(_cache[28] || (_cache[28] = [
                                                    createTextVNode(" 启用 ", -1)
                                                  ]))]),
                                                  _: 1
                                                }, 8, ["onClick"])),
                                            (account.enabled)
                                              ? (openBlock(), createBlock(_sfc_main$C, {
                                                  key: 5,
                                                  variant: "ghost",
                                                  size: "sm",
                                                  class: "text-ember hover:bg-status-error-soft hover:text-ember",
                                                  onClick: $event => (confirmDelete(account))
                                                }, {
                                                  default: withCtx(() => [...(_cache[29] || (_cache[29] = [
                                                    createTextVNode(" 删除 ", -1)
                                                  ]))]),
                                                  _: 1
                                                }, 8, ["onClick"]))
                                              : createCommentVNode("", true)
                                          ], 64))
                                    ])
                                  ]),
                                  _: 2
                                }, 1024)
                              ]),
                              _: 2
                            }, 1032, ["class"]))
                          }), 128))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        })
      ]),
      createVNode(_sfc_main$B, {
        open: dialog.value !== null,
        title: dialogMeta.value?.title,
        description: dialogMeta.value?.description,
        destructive: dialogMeta.value?.destructive,
        "onUpdate:open": _cache[3] || (_cache[3] = $event => (dialog.value = null))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[2] || (_cache[2] = $event => (dialog.value = null))
          }, {
            default: withCtx(() => [...(_cache[30] || (_cache[30] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            variant: dialogMeta.value?.destructive ? 'destructive' : 'default',
            disabled: pending.value,
            onClick: onConfirm
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(pending.value ? '处理中…' : dialogMeta.value?.confirm), 1)
            ]),
            _: 1
          }, 8, ["variant", "disabled"])
        ]),
        default: withCtx(() => [
          (dialog.value?.type === 'reset-password')
            ? (openBlock(), createElementBlock("div", _hoisted_12$3, [
                createBaseVNode("p", null, "此操作将重置所选 " + toDisplayString(resetTarget.value.code) + " 账号的密码；", 1),
                createBaseVNode("p", null, "科应账号 " + toDisplayString(resetTarget.value.username) + " 的会话将会回收，由系统生成新密码并在科应后台自动完成改密。", 1)
              ]))
            : createCommentVNode("", true)
        ]),
        _: 1
      }, 8, ["open", "title", "description", "destructive"]),
      createVNode(_sfc_main$B, {
        open: renameOpen.value,
        title: `修改账号名称 ${renameTarget.value?.code ?? ''}`,
        description: "账号名称对应科应平台账号，重置密码等自动化流程依据该名称定位账号。",
        "onUpdate:open": _cache[6] || (_cache[6] = $event => (renameOpen.value = false))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[5] || (_cache[5] = $event => (renameOpen.value = false))
          }, {
            default: withCtx(() => [...(_cache[32] || (_cache[32] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            disabled: pending.value,
            onClick: onRenameSubmit
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(pending.value ? '保存中…' : '保存'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("form", {
            class: "flex flex-col gap-4",
            onSubmit: withModifiers(onRenameSubmit, ["prevent"])
          }, [
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[31] || (_cache[31] = [
                  createTextVNode("账号名称", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$t, {
                modelValue: renameValue.value,
                "onUpdate:modelValue": _cache[4] || (_cache[4] = $event => ((renameValue).value = $event)),
                placeholder: "例如 ky-01",
                class: "mt-1.5"
              }, null, 8, ["modelValue"])
            ])
          ], 32)
        ]),
        _: 1
      }, 8, ["open", "title"]),
      createVNode(_sfc_main$B, {
        open: createOpen.value,
        title: "新增科应账号",
        "onUpdate:open": _cache[10] || (_cache[10] = (v) => (createOpen.value = v))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[9] || (_cache[9] = $event => (createOpen.value = false))
          }, {
            default: withCtx(() => [...(_cache[36] || (_cache[36] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            disabled: pending.value || !createForm.value.code.trim() || !createForm.value.username.trim(),
            onClick: saveCreate
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(pending.value ? '创建中…' : '创建'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_13$3, [
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[33] || (_cache[33] = [
                  createTextVNode("账号编号", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$t, {
                modelValue: createForm.value.code,
                "onUpdate:modelValue": _cache[7] || (_cache[7] = $event => ((createForm.value.code) = $event)),
                placeholder: "如 KY-11",
                class: "mt-1.5"
              }, null, 8, ["modelValue"])
            ]),
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[34] || (_cache[34] = [
                  createTextVNode("科应账号", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$t, {
                modelValue: createForm.value.username,
                "onUpdate:modelValue": _cache[8] || (_cache[8] = $event => ((createForm.value.username) = $event)),
                placeholder: "如 ky-11",
                class: "mt-1.5"
              }, null, 8, ["modelValue"])
            ]),
            _cache[35] || (_cache[35] = createBaseVNode("p", { class: "text-xs text-mid-gray" }, "密码由系统以占位密文托管，创建后管理员可经「重置密码」生成真实密码。", -1))
          ])
        ]),
        _: 1
      }, 8, ["open"]),
      createVNode(_sfc_main$B, {
        open: deleteOpen.value,
        title: "删除账号",
        destructive: "",
        description: `确认删除「${deleteTarget.value?.code ?? ''}${deleteTarget.value?.username ? `（${deleteTarget.value.username}）` : ''}」？该操作不可撤销，相关租约与审计记录一并清除。`,
        "onUpdate:open": _cache[12] || (_cache[12] = $event => (deleteOpen.value = false))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[11] || (_cache[11] = $event => (deleteOpen.value = false))
          }, {
            default: withCtx(() => [...(_cache[37] || (_cache[37] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            variant: "destructive",
            disabled: pending.value,
            onClick: doDelete
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(pending.value ? '删除中…' : '删除'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        _: 1
      }, 8, ["open", "description"]),
      createVNode(_sfc_main$B, {
        open: importOpen.value,
        title: "导入科应账号（CSV / XLSX）",
        "onUpdate:open": onImportDialogToggle
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[13] || (_cache[13] = $event => (onImportDialogToggle(false)))
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(importResult.value ? '关闭' : '取消'), 1)
            ]),
            _: 1
          }),
          (!importResult.value)
            ? (openBlock(), createBlock(_sfc_main$C, {
                key: 0,
                disabled: pending.value || importRows.value.length === 0,
                onClick: confirmImport
              }, {
                default: withCtx(() => [
                  createTextVNode(toDisplayString(pending.value ? '导入中…' : `导入 ${importRows.value.length} 条`), 1)
                ]),
                _: 1
              }, 8, ["disabled"]))
            : createCommentVNode("", true)
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_14$3, [
            createBaseVNode("div", _hoisted_15$3, [
              createVNode(_sfc_main$C, {
                variant: "outline",
                size: "sm",
                onClick: triggerImportFile
              }, {
                default: withCtx(() => [...(_cache[38] || (_cache[38] = [
                  createTextVNode("选择文件", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$C, {
                variant: "ghost",
                size: "sm",
                onClick: downloadAccountTemplate
              }, {
                default: withCtx(() => [...(_cache[39] || (_cache[39] = [
                  createTextVNode("下载CSV模板", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$C, {
                variant: "ghost",
                size: "sm",
                onClick: downloadAccountXlsxTemplate
              }, {
                default: withCtx(() => [...(_cache[40] || (_cache[40] = [
                  createTextVNode("下载XLSX模板", -1)
                ]))]),
                _: 1
              }),
              createBaseVNode("input", {
                ref_key: "importFileRef",
                ref: importFileRef,
                type: "file",
                accept: unref(SPREADSHEET_ACCEPT),
                class: "hidden",
                onChange: onImportFile
              }, null, 40, _hoisted_16$3)
            ]),
            _cache[42] || (_cache[42] = createBaseVNode("p", { class: "text-xs text-mid-gray" }, "必需列：账号编号、科应账号。支持 .csv / .xlsx（.xlsm / .xls），首行为列名。密码由系统托管，导入后管理员可经「重置密码」生成。", -1)),
            (importRows.value.length || importFailed.value.length)
              ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createBaseVNode("div", _hoisted_17$3, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(importRows.value, (r) => {
                      return (openBlock(), createElementBlock("div", {
                        key: 'ok' + r.index,
                        class: "flex items-center justify-between gap-2 border-b border-hairline px-3 py-1.5 text-xs"
                      }, [
                        createBaseVNode("span", _hoisted_18$2, toDisplayString(r.code), 1),
                        createBaseVNode("span", _hoisted_19$1, toDisplayString(r.username), 1),
                        _cache[41] || (_cache[41] = createBaseVNode("span", { class: "text-green-600" }, "可导入", -1))
                      ]))
                    }), 128)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(importFailed.value, (r) => {
                      return (openBlock(), createElementBlock("div", {
                        key: 'bad' + r.index,
                        class: "flex items-center justify-between gap-2 border-b border-hairline px-3 py-1.5 text-xs"
                      }, [
                        createBaseVNode("span", _hoisted_20, toDisplayString(r.code || '(空)'), 1),
                        createBaseVNode("span", _hoisted_21, toDisplayString(r.username || ''), 1),
                        createBaseVNode("span", _hoisted_22, toDisplayString(r.errors.join('；')), 1)
                      ]))
                    }), 128))
                  ]),
                  createBaseVNode("p", {
                    class: normalizeClass(["text-xs", importFailed.value.length ? 'text-ember' : 'text-mid-gray'])
                  }, " 可导入 " + toDisplayString(importRows.value.length) + " 条，跳过 " + toDisplayString(importFailed.value.length) + " 条 ", 3)
                ], 64))
              : createCommentVNode("", true),
            (importResult.value && importResult.value.created > 0)
              ? (openBlock(), createElementBlock("p", _hoisted_23, " 已导入 " + toDisplayString(importResult.value.created) + " 条。导入账号的密码为系统占位值， 需逐个执行「重置密码」生成真实密码后方可领用。 ", 1))
              : createCommentVNode("", true)
          ])
        ]),
        _: 1
      }, 8, ["open"])
    ]),
    _: 1
  }))
}
}

};

const _hoisted_1$6 = { class: "flex flex-col gap-6" };
const _hoisted_2$4 = { class: "flex flex-wrap items-center justify-between gap-3" };
const _hoisted_3$4 = { class: "flex items-center gap-2" };
const _hoisted_4$4 = ["accept"];
const _hoisted_5$4 = { class: "flex items-center justify-end gap-2 whitespace-nowrap" };
const _hoisted_6$4 = {
  key: 0,
  class: "mt-1.5 text-xs text-ember"
};
const _hoisted_7$4 = {
  key: 0,
  class: "mt-1.5 text-xs text-status-available"
};
const _hoisted_8$3 = { class: "max-h-[50dvh] overflow-y-auto" };
const _hoisted_9$3 = { class: "w-full text-left text-sm" };
const _hoisted_10$2 = { class: "py-1.5 pr-2 tabular-nums text-mid-gray" };
const _hoisted_11$2 = { class: "py-1.5 pr-2 font-medium" };
const _hoisted_12$2 = { class: "py-1.5 pr-2" };
const _hoisted_13$2 = { class: "py-1.5 pr-2 text-mid-gray" };
const _hoisted_14$2 = { class: "py-1.5 pr-2" };
const _hoisted_15$2 = { class: "py-1.5" };
const _hoisted_16$2 = {
  key: 0,
  class: "text-xs text-status-available"
};
const _hoisted_17$2 = {
  key: 1,
  class: "text-xs text-status-available"
};
const _hoisted_18$1 = {
  key: 2,
  class: "text-xs text-ember"
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** 用户表格模板（CSV 与 XLSX 共用同一套列名约定）。 */

const _sfc_main$a = {
  __name: 'UsersPage',
  setup(__props) {

const USER_TEMPLATE_AOA = [
  ['用户名', '姓名', '部门', '角色', '密码'],
  ['zhangsan', '张三', '研发部', 'USER', '初始密码123'],
  ['lisi', '李四', '产品部', 'USER', '初始密码456'],
];

const ROLE_OPTIONS = [
  { value: 'USER', label: 'USER' },
  { value: 'ADMIN', label: 'ADMIN' },
];

const loading = ref(true);
const error = ref('');
const users = ref([]);
const pending = ref(false);

const formOpen = ref(false);
const formMode = ref('create');
const formUser = ref(null);
const form = ref({ username: '', displayName: '', department: '', role: 'USER', password: '' });

const confirm = ref(null); // { type: 'disable'|'enable', user }

// ── 表格批量导入（CSV / XLSX，上传 → 解析预览二次确认 → 批量创建） ──
const csvInputRef = ref(null);
const importOpen = ref(false); // 预览/确认弹窗
const importRows = ref([]); // 解析后的行
const importHeaderErrors = ref([]);
const importing = ref(false);
const importResult = ref(null); // { created, failed: [] }

function pickCsv() {
  csvInputRef.value?.click();
}

/** 触发浏览器下载（a 需入 DOM 且延后 revoke，否则部分浏览器会中断下载）。data 为字符串(CSV)或字节(XLSX)。 */
function downloadBlob(filename, data, type) {
  const isBinary = typeof data !== 'string';
  const blob = isBinary
    ? new Blob([data], { type })
    : new Blob(['\uFEFF' + data], { type: type || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTemplate() {
  downloadBlob('用户导入模板.csv', usersCsvTemplate());
}

/** 下载 xlsx 模板：与解析共用同一份 vendored SheetJS 生成，保证读得回。 */
async function downloadXlsxTemplate() {
  try {
    const bytes = await aoaToWorkbookBytes(USER_TEMPLATE_AOA, '用户模板');
    downloadBlob('用户导入模板.xlsx', bytes, XLSX_MIME);
  } catch (e) {
    toast({ title: e?.message || '模板生成失败', variant: 'destructive' });
  }
}

/**
 * 可提交的行。三个条件同时成立才可导入：
 *   1. 行本身无校验错误；
 *   2. 表头无缺列（缺列时字段为空，行级已报错，这里是双保险）；
 *   3. 本轮尚未出结果（importResult 非空）——导入后再放行会导致重复提交，
 *      第二次整批因「用户名已存在」失败，用户会误判为导入功能坏了。
 */
const importValidRows = computed(() =>
  importResult.value || importHeaderErrors.value.length
    ? []
    : importRows.value.filter((r) => r.errors.length === 0),
);

function onCsvFile(event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // 允许重复选择同一文件
  if (!file) return
  if (!isSpreadsheetFile(file.name)) {
    toast({ title: `仅支持 ${SPREADSHEET_EXTENSIONS.join(' / ')} 文件`, variant: 'destructive' });
    return
  }
  parseUsersFile(file)
    .then(({ rows, headerErrors }) => {
      importHeaderErrors.value = headerErrors;
      importRows.value = rows;
      importResult.value = null;
      if (rows.length === 0) {
        toast({
          title: '未解析到有效数据行',
          description: headerErrors.join('；') || undefined,
          variant: 'destructive',
        });
        return
      }
      importOpen.value = true;
    })
    .catch((e) => toast({ title: e?.message || '文件解析失败', variant: 'destructive' }));
}

function onImportDialogToggle(open) {
  importOpen.value = open;
  // 关闭时清空本轮上下文，避免下次打开残留上一次的预览与结果
  if (!open) {
    importRows.value = [];
    importHeaderErrors.value = [];
    importResult.value = null;
  }
}

async function onImportConfirm() {
  if (importValidRows.value.length === 0) return
  importing.value = true;
  try {
    const payload = importValidRows.value.map((r) => ({
      username: r.username,
      displayName: r.displayName,
      department: r.department,
      role: r.role,
      password: r.password,
    }));
    const res = await bulkCreateUsers(payload);
    // 把后端逐行结果回写到预览：成功行标「已导入」，失败行补上后端原因，
    // 让「预览」与「结果」对得上，而不是另起一段与列表无关的文字。
    const failedReason = new Map((res.failed ?? []).map((f) => [f.username, f.reason]));
    importRows.value = importRows.value.map((row) => {
      if (row.errors.length > 0) return row
      const reason = failedReason.get(row.username);
      return reason ? { ...row, errors: [reason] } : { ...row, imported: true }
    });
    importResult.value = res;
    toast({
      title: `导入完成：成功 ${res.created} 个${res.failed.length ? `，失败 ${res.failed.length} 个` : ''}`,
      variant: res.failed.length ? 'default' : 'success',
    });
    load();
    // 全部成功才自动关闭；有失败时保留弹窗展示明细（此时提交按钮已禁用，不会重复提交）
    if (res.failed.length === 0) importOpen.value = false;
  } catch (e) {
    toast({ title: e?.message || '导入失败', variant: 'destructive' });
  } finally {
    importing.value = false;
  }
}

const currentUsername = computed(() => authState.user?.username);

async function load() {
  try {
    users.value = await getAdminUsers();
    error.value = '';
  } catch (e) {
    error.value = e?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function isSelf(user) {
  return user.username === currentUsername.value
}

function openCreate() {
  formMode.value = 'create';
  formUser.value = null;
  form.value = { username: '', displayName: '', department: '', role: 'USER', password: '' };
  formOpen.value = true;
}

function openEdit(user) {
  formMode.value = 'edit';
  formUser.value = user;
  form.value = { username: user.username, displayName: user.displayName, department: user.department, role: user.role, password: '' };
  formOpen.value = true;
}

async function onFormSubmit() {
  if (formMode.value === 'create') {
    if (!form.value.username || !form.value.displayName || !form.value.password) {
      toast({ title: '请填写用户名、姓名与初始密码', variant: 'destructive' });
      return
    }
  }
  pending.value = true;
  try {
    if (formMode.value === 'create') {
      await createUser({
        username: form.value.username,
        displayName: form.value.displayName,
        department: form.value.department,
        role: form.value.role,
        password: form.value.password,
      });
      toast({ title: '已创建用户', variant: 'success' });
    } else {
      await updateUser(formUser.value.id, {
        displayName: form.value.displayName,
        department: form.value.department,
        role: form.value.role,
      });
      toast({ title: '已保存', variant: 'success' });
    }
    formOpen.value = false;
    load();
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

// ── 重置用户密码：两段式（先验证当前管理员密码 → 再设置新密码） ──
// 需求：管理员重置用户密码前必须自证当前密码。验证通过后拿到 HMAC 短时票据
// （verifyToken，5 分钟），第二步提交新密码时一并携带，后端校验票据后才执行，
// 避免「验证归验证、提交归提交」被无验证请求绕过。
const resetTarget = ref(null); // { id, username }
const verifyOpen = ref(false); // 第一步：安全验证弹窗
const verifyPassword = ref('');
const verifyBusy = ref(false);
const verifyError = ref('');
const verifyToken = ref('');
const resetOpen = ref(false); // 第二步：设置新密码弹窗
const newPassword = ref('');
const resetBusy = ref(false);
const resetResult = ref(false); // 本轮是否已成功（关闭时重置）

function openReset(user) {
  resetTarget.value = { id: user.id, username: user.username };
  verifyPassword.value = '';
  verifyError.value = '';
  verifyToken.value = '';
  newPassword.value = '';
  resetResult.value = false;
  verifyOpen.value = true;
}

async function onVerifySubmit() {
  if (!verifyPassword.value) {
    verifyError.value = '请输入当前管理员密码';
    return
  }
  verifyBusy.value = true;
  verifyError.value = '';
  try {
    const res = await verifyAdminPassword(verifyPassword.value);
    verifyToken.value = res.verifyToken;
    verifyOpen.value = false;
    resetOpen.value = true;
  } catch (e) {
    verifyError.value = e?.message || '验证失败，请重试';
  } finally {
    verifyBusy.value = false;
  }
}

async function onResetSubmit() {
  const pwd = newPassword.value;
  if (!pwd) {
    toast({ title: '请输入新密码', variant: 'destructive' });
    return
  }
  if (pwd.length < 8 || pwd.length > 72) {
    toast({ title: '新密码长度需在 8–72 个字符之间', variant: 'destructive' });
    return
  }
  resetBusy.value = true;
  try {
    await resetUserPassword(resetTarget.value.id, pwd, verifyToken.value);
    resetResult.value = true;
    toast({ title: `已重置 ${resetTarget.value.username} 的密码，请转告用户`, variant: 'success' });
    load();
    // 稍作停留展示成功态后关闭（resetResult 仅用于界面反馈，不承载流程状态）
    window.setTimeout(() => {
      resetOpen.value = false;
      resetResult.value = false;
    }, 600);
  } catch (e) {
    toast({ title: e?.message || '重置失败', variant: 'destructive' });
    // 票据失效（超时 / 过期）→ 回到第一步重新验证
    if (e?.status === 401) {
      resetOpen.value = false;
      verifyOpen.value = true;
      verifyError.value = '安全验证已失效，请重新输入当前管理员密码';
    }
  } finally {
    resetBusy.value = false;
  }
}

function openToggle(user) {
  confirm.value = { type: user.enabled ? 'disable' : 'enable', user };
}

async function onToggleConfirm() {
  const { type, user } = confirm.value;
  pending.value = true;
  try {
    await updateUser(user.id, { enabled: type === 'enable' });
    toast({ title: type === 'disable' ? '已禁用用户' : '已启用用户', variant: 'success' });
    confirm.value = null;
    load();
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' });
  } finally {
    pending.value = false;
  }
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(_sfc_main$k, null, {
    default: withCtx(() => [
      createBaseVNode("div", _hoisted_1$6, [
        createBaseVNode("div", _hoisted_2$4, [
          _cache[23] || (_cache[23] = createBaseVNode("h1", { class: "text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8" }, " 用户管理 ", -1)),
          createBaseVNode("div", _hoisted_3$4, [
            createVNode(_sfc_main$C, {
              variant: "outline",
              onClick: downloadTemplate
            }, {
              default: withCtx(() => [...(_cache[19] || (_cache[19] = [
                createTextVNode("下载模板", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, {
              variant: "outline",
              onClick: downloadXlsxTemplate
            }, {
              default: withCtx(() => [...(_cache[20] || (_cache[20] = [
                createTextVNode("XLSX模板", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, {
              variant: "outline",
              onClick: pickCsv
            }, {
              default: withCtx(() => [...(_cache[21] || (_cache[21] = [
                createTextVNode("导入表格", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, { onClick: openCreate }, {
              default: withCtx(() => [...(_cache[22] || (_cache[22] = [
                createTextVNode("创建用户", -1)
              ]))]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("input", {
          ref_key: "csvInputRef",
          ref: csvInputRef,
          type: "file",
          accept: unref(SPREADSHEET_ACCEPT),
          class: "hidden",
          onChange: onCsvFile
        }, null, 40, _hoisted_4$4),
        createVNode(_sfc_main$w, { class: "overflow-hidden" }, {
          default: withCtx(() => [
            createVNode(_sfc_main$h, { "min-width": "min-w-[840px]" }, {
              default: withCtx(() => [
                createVNode(_sfc_main$d, null, {
                  default: withCtx(() => [
                    createVNode(_sfc_main$c, null, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[24] || (_cache[24] = [
                            createTextVNode("用户名", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[25] || (_cache[25] = [
                            createTextVNode("姓名", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[26] || (_cache[26] = [
                            createTextVNode("部门", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[27] || (_cache[27] = [
                            createTextVNode("角色", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[28] || (_cache[28] = [
                            createTextVNode("状态", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, { class: "text-right" }, {
                          default: withCtx(() => [...(_cache[29] || (_cache[29] = [
                            createTextVNode("操作", -1)
                          ]))]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                createVNode(_sfc_main$g, null, {
                  default: withCtx(() => [
                    (loading.value)
                      ? (openBlock(), createElementBlock(Fragment, { key: 0 }, renderList(4, (i) => {
                          return createVNode(_sfc_main$c, { key: i }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, { colspan: "6" }, {
                                default: withCtx(() => [
                                  createVNode(_sfc_main$v, { class: "h-6 w-full" })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        }), 64))
                      : (error.value)
                        ? (openBlock(), createBlock(_sfc_main$c, { key: 1 }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, {
                                colspan: "6",
                                class: "py-6 text-center text-mid-gray"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(error.value) + " ", 1),
                                  createVNode(_sfc_main$C, {
                                    variant: "outline",
                                    size: "sm",
                                    class: "ml-3",
                                    onClick: load
                                  }, {
                                    default: withCtx(() => [...(_cache[30] || (_cache[30] = [
                                      createTextVNode("重试", -1)
                                    ]))]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }))
                        : (openBlock(true), createElementBlock(Fragment, { key: 2 }, renderList(users.value, (user) => {
                            return (openBlock(), createBlock(_sfc_main$c, {
                              key: user.id
                            }, {
                              default: withCtx(() => [
                                createVNode(_sfc_main$f, { class: "font-medium" }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(user.username), 1)
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, null, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(user.displayName), 1)
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, { class: "text-mid-gray" }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(user.department || '—'), 1)
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, null, {
                                  default: withCtx(() => [
                                    createVNode(_sfc_main$n, { variant: "soft" }, {
                                      default: withCtx(() => [
                                        createTextVNode(toDisplayString(user.role), 1)
                                      ]),
                                      _: 2
                                    }, 1024)
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, null, {
                                  default: withCtx(() => [
                                    (user.enabled)
                                      ? (openBlock(), createBlock(_sfc_main$n, {
                                          key: 0,
                                          tone: "available"
                                        }, {
                                          default: withCtx(() => [...(_cache[31] || (_cache[31] = [
                                            createTextVNode("启用", -1)
                                          ]))]),
                                          _: 1
                                        }))
                                      : (openBlock(), createBlock(_sfc_main$n, {
                                          key: 1,
                                          variant: "outline"
                                        }, {
                                          default: withCtx(() => [...(_cache[32] || (_cache[32] = [
                                            createTextVNode("停用", -1)
                                          ]))]),
                                          _: 1
                                        }))
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_sfc_main$f, null, {
                                  default: withCtx(() => [
                                    createBaseVNode("div", _hoisted_5$4, [
                                      createVNode(_sfc_main$C, {
                                        variant: "ghost",
                                        size: "sm",
                                        onClick: $event => (openEdit(user))
                                      }, {
                                        default: withCtx(() => [...(_cache[33] || (_cache[33] = [
                                          createTextVNode("编辑", -1)
                                        ]))]),
                                        _: 1
                                      }, 8, ["onClick"]),
                                      createVNode(_sfc_main$C, {
                                        variant: "ghost",
                                        size: "sm",
                                        onClick: $event => (openReset(user))
                                      }, {
                                        default: withCtx(() => [...(_cache[34] || (_cache[34] = [
                                          createTextVNode("重置密码", -1)
                                        ]))]),
                                        _: 1
                                      }, 8, ["onClick"]),
                                      createVNode(_sfc_main$C, {
                                        variant: "ghost",
                                        size: "sm",
                                        class: normalizeClass(user.enabled ? 'text-ember hover:bg-status-error-soft hover:text-ember' : ''),
                                        disabled: isSelf(user),
                                        onClick: $event => (openToggle(user))
                                      }, {
                                        default: withCtx(() => [
                                          createTextVNode(toDisplayString(user.enabled ? '禁用' : '启用'), 1)
                                        ]),
                                        _: 2
                                      }, 1032, ["class", "disabled", "onClick"])
                                    ])
                                  ]),
                                  _: 2
                                }, 1024)
                              ]),
                              _: 2
                            }, 1024))
                          }), 128))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        })
      ]),
      createVNode(_sfc_main$B, {
        open: formOpen.value,
        title: formMode.value === 'create' ? '创建用户' : '编辑用户',
        "onUpdate:open": _cache[9] || (_cache[9] = $event => (formOpen.value = false))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[8] || (_cache[8] = $event => (formOpen.value = false))
          }, {
            default: withCtx(() => [...(_cache[43] || (_cache[43] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            disabled: pending.value,
            onClick: onFormSubmit
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(pending.value ? '提交中…' : '保存'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("form", {
            class: "flex flex-col gap-4",
            onSubmit: withModifiers(onFormSubmit, ["prevent"])
          }, [
            (formMode.value === 'create')
              ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[35] || (_cache[35] = [
                        createTextVNode("用户名", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$t, {
                      modelValue: form.value.username,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((form.value.username) = $event)),
                      placeholder: "例如 zhangsan",
                      class: "mt-1.5"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[36] || (_cache[36] = [
                        createTextVNode("姓名", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$t, {
                      modelValue: form.value.displayName,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = $event => ((form.value.displayName) = $event)),
                      placeholder: "例如 张三",
                      class: "mt-1.5"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[37] || (_cache[37] = [
                        createTextVNode("部门", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$t, {
                      modelValue: form.value.department,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = $event => ((form.value.department) = $event)),
                      placeholder: "例如 研发部",
                      class: "mt-1.5"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[38] || (_cache[38] = [
                        createTextVNode("角色", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$i, {
                      modelValue: form.value.role,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = $event => ((form.value.role) = $event)),
                      options: ROLE_OPTIONS,
                      class: "mt-1.5"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[39] || (_cache[39] = [
                        createTextVNode("初始密码", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$t, {
                      modelValue: form.value.password,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = $event => ((form.value.password) = $event)),
                      type: "password",
                      placeholder: "初始登录密码",
                      class: "mt-1.5"
                    }, null, 8, ["modelValue"])
                  ])
                ], 64))
              : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[40] || (_cache[40] = [
                        createTextVNode("姓名", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$t, {
                      modelValue: form.value.displayName,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = $event => ((form.value.displayName) = $event)),
                      class: "mt-1.5"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[41] || (_cache[41] = [
                        createTextVNode("部门", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$t, {
                      modelValue: form.value.department,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = $event => ((form.value.department) = $event)),
                      class: "mt-1.5"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", null, [
                    createVNode(_sfc_main$s, null, {
                      default: withCtx(() => [...(_cache[42] || (_cache[42] = [
                        createTextVNode("角色", -1)
                      ]))]),
                      _: 1
                    }),
                    createVNode(_sfc_main$i, {
                      modelValue: form.value.role,
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = $event => ((form.value.role) = $event)),
                      options: ROLE_OPTIONS,
                      disabled: isSelf(formUser.value),
                      class: "mt-1.5"
                    }, null, 8, ["modelValue", "disabled"])
                  ])
                ], 64))
          ], 32)
        ]),
        _: 1
      }, 8, ["open", "title"]),
      createVNode(_sfc_main$B, {
        open: verifyOpen.value,
        title: `安全验证：重置 ${resetTarget.value?.username ?? ''} 的密码`,
        description: "此操作将重置该用户的登录密码并使 TA 的所有会话失效。请先输入当前管理员的登录密码完成身份验证。",
        "onUpdate:open": _cache[12] || (_cache[12] = (v) => (v ? null : (verifyOpen.value = false)))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[11] || (_cache[11] = $event => (verifyOpen.value = false))
          }, {
            default: withCtx(() => [...(_cache[45] || (_cache[45] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            disabled: verifyBusy.value || !verifyPassword.value,
            onClick: onVerifySubmit
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(verifyBusy.value ? '验证中…' : '验证并继续'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("form", {
            class: "flex flex-col gap-4",
            onSubmit: withModifiers(onVerifySubmit, ["prevent"])
          }, [
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[44] || (_cache[44] = [
                  createTextVNode("当前管理员密码", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$t, {
                modelValue: verifyPassword.value,
                "onUpdate:modelValue": _cache[10] || (_cache[10] = $event => ((verifyPassword).value = $event)),
                type: "password",
                placeholder: "输入当前管理员登录密码",
                class: "mt-1.5",
                autocomplete: "current-password"
              }, null, 8, ["modelValue"]),
              (verifyError.value)
                ? (openBlock(), createElementBlock("p", _hoisted_6$4, toDisplayString(verifyError.value), 1))
                : createCommentVNode("", true)
            ])
          ], 32)
        ]),
        _: 1
      }, 8, ["open", "title"]),
      createVNode(_sfc_main$B, {
        open: resetOpen.value,
        title: `重置 ${resetTarget.value?.username ?? ''} 的密码`,
        description: "安全验证已通过。请为对方设置新登录密码（8–72 个字符），保存后其旧会话将全部失效。",
        "onUpdate:open": _cache[15] || (_cache[15] = (v) => (v ? null : (resetOpen.value = false)))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[14] || (_cache[14] = $event => (resetOpen.value = false))
          }, {
            default: withCtx(() => [...(_cache[47] || (_cache[47] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            disabled: resetBusy.value || !newPassword.value,
            onClick: onResetSubmit
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(resetBusy.value ? '重置中…' : '确认重置'), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("form", {
            class: "flex flex-col gap-4",
            onSubmit: withModifiers(onResetSubmit, ["prevent"])
          }, [
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[46] || (_cache[46] = [
                  createTextVNode("新密码", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$t, {
                modelValue: newPassword.value,
                "onUpdate:modelValue": _cache[13] || (_cache[13] = $event => ((newPassword).value = $event)),
                type: "password",
                placeholder: "输入新登录密码（8–72 个字符）",
                class: "mt-1.5",
                autocomplete: "new-password"
              }, null, 8, ["modelValue"]),
              (resetResult.value)
                ? (openBlock(), createElementBlock("p", _hoisted_7$4, "✓ 密码已重置"))
                : createCommentVNode("", true)
            ])
          ], 32)
        ]),
        _: 1
      }, 8, ["open", "title"]),
      createVNode(_sfc_main$B, {
        open: importOpen.value,
        title: "确认导入用户",
        description: importHeaderErrors.value.length
        ? `${importHeaderErrors.value.join('；')}。请补全列后重新选择文件。`
        : importResult.value
          ? '导入已完成，下方为逐行结果。'
          : `已解析 ${importRows.value.length} 行，其中 ${importValidRows.value.length} 行可导入。请确认下方列表后再执行导入。`,
        "onUpdate:open": onImportDialogToggle
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[16] || (_cache[16] = $event => (onImportDialogToggle(false)))
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(importResult.value ? '关闭' : '取消'), 1)
            ]),
            _: 1
          }),
          (!importResult.value)
            ? (openBlock(), createBlock(_sfc_main$C, {
                key: 0,
                disabled: importing.value || importValidRows.value.length === 0,
                onClick: onImportConfirm
              }, {
                default: withCtx(() => [
                  createTextVNode(toDisplayString(importing.value ? '导入中…' : `确认导入 ${importValidRows.value.length} 个用户`), 1)
                ]),
                _: 1
              }, 8, ["disabled"]))
            : createCommentVNode("", true)
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_8$3, [
            createBaseVNode("table", _hoisted_9$3, [
              _cache[48] || (_cache[48] = createBaseVNode("thead", { class: "sticky top-0 bg-paper" }, [
                createBaseVNode("tr", { class: "text-xs text-mid-gray" }, [
                  createBaseVNode("th", { class: "py-1.5 pr-2 font-medium" }, "#"),
                  createBaseVNode("th", { class: "py-1.5 pr-2 font-medium" }, "用户名"),
                  createBaseVNode("th", { class: "py-1.5 pr-2 font-medium" }, "姓名"),
                  createBaseVNode("th", { class: "py-1.5 pr-2 font-medium" }, "部门"),
                  createBaseVNode("th", { class: "py-1.5 pr-2 font-medium" }, "角色"),
                  createBaseVNode("th", { class: "py-1.5 font-medium" }, "检查")
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(importRows.value, (row) => {
                  return (openBlock(), createElementBlock("tr", {
                    key: row.index,
                    class: "border-t border-hairline"
                  }, [
                    createBaseVNode("td", _hoisted_10$2, toDisplayString(row.index), 1),
                    createBaseVNode("td", _hoisted_11$2, toDisplayString(row.username || '—'), 1),
                    createBaseVNode("td", _hoisted_12$2, toDisplayString(row.displayName || '—'), 1),
                    createBaseVNode("td", _hoisted_13$2, toDisplayString(row.department || '—'), 1),
                    createBaseVNode("td", _hoisted_14$2, toDisplayString(row.role), 1),
                    createBaseVNode("td", _hoisted_15$2, [
                      (row.imported)
                        ? (openBlock(), createElementBlock("span", _hoisted_16$2, "✓ 已导入"))
                        : (row.errors.length === 0)
                          ? (openBlock(), createElementBlock("span", _hoisted_17$2, "✓ 可导入"))
                          : (openBlock(), createElementBlock("span", _hoisted_18$1, toDisplayString(row.errors.join('；')), 1))
                    ])
                  ]))
                }), 128))
              ])
            ])
          ])
        ]),
        _: 1
      }, 8, ["open", "description"]),
      createVNode(_sfc_main$B, {
        open: confirm.value !== null,
        title: confirm.value?.type === 'disable' ? `禁用用户 ${confirm.value?.user?.username}` : `启用用户 ${confirm.value?.user?.username}`,
        description: confirm.value?.type === 'disable' ? '禁用后该用户无法登录；若有活动租约，请先强制回收对应账号。' : undefined,
        destructive: confirm.value?.type === 'disable',
        "onUpdate:open": _cache[18] || (_cache[18] = $event => (confirm.value = null))
      }, {
        footer: withCtx(() => [
          createVNode(_sfc_main$C, {
            variant: "outline",
            onClick: _cache[17] || (_cache[17] = $event => (confirm.value = null))
          }, {
            default: withCtx(() => [...(_cache[49] || (_cache[49] = [
              createTextVNode("取消", -1)
            ]))]),
            _: 1
          }),
          createVNode(_sfc_main$C, {
            variant: confirm.value?.type === 'disable' ? 'destructive' : 'default',
            disabled: pending.value,
            onClick: onToggleConfirm
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(pending.value ? '处理中…' : confirm.value?.type === 'disable' ? '确认禁用' : '确认启用'), 1)
            ]),
            _: 1
          }, 8, ["variant", "disabled"])
        ]),
        _: 1
      }, 8, ["open", "title", "description", "destructive"])
    ]),
    _: 1
  }))
}
}

};

const _hoisted_1$5 = { class: "flex flex-col gap-6" };
const _hoisted_2$3 = { class: "flex flex-wrap items-center justify-between gap-3" };
const _hoisted_3$3 = { class: "w-full max-w-[10rem] sm:w-40" };
const _hoisted_4$3 = {
  key: 1,
  class: "text-mid-gray"
};
const _hoisted_5$3 = { class: "flex flex-wrap items-center justify-between gap-3 text-xs text-mid-gray" };
const _hoisted_6$3 = { class: "flex items-center gap-2" };
const _hoisted_7$3 = { class: "tabular-nums" };

const PAGE_SIZE$1 = 10;


const _sfc_main$9 = {
  __name: 'LeasesPage',
  setup(__props) {

const FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'ACTIVE', label: '使用中' },
  { value: 'RELEASED', label: '已释放' },
];

const RELEASE_REASON_META = {
  USER_RETURN: { label: '用户归还', variant: 'outline', tone: null },
  INACTIVITY_TIMEOUT: { label: '超时', variant: null, tone: 'recycling' },
  ADMIN_FORCE: { label: '强制回收', variant: null, tone: 'in_use' },
  RESET_ERROR: { label: '重置失败', variant: null, tone: 'error' },
};

const loading = ref(true);
const pending = ref(false);
const error = ref('');
const items = ref([]);
const total = ref(0);
const filter = ref('all');
const page = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE$1)));

async function load(opts = {}) {
  if (opts.silent) pending.value = true;
  else loading.value = true;
  try {
    // 状态过滤与分页都在后端完成（GET /admin/leases?status=&page=&pageSize=）
    const res = await getAdminLeases({ status: filter.value, page: page.value, pageSize: PAGE_SIZE$1 });
    items.value = res.items || [];
    total.value = res.total ?? 0;
    error.value = '';
  } catch (e) {
    error.value = e?.message || '加载失败';
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
    pending.value = false;
  }
}

function goPrev() {
  if (page.value > 1) {
    page.value -= 1;
    load({ silent: true });
  }
}

function goNext() {
  if (page.value < totalPages.value) {
    page.value += 1;
    load({ silent: true });
  }
}

onMounted(load);

// 状态筛选变化 → 回到第 1 页，由后端重新过滤
watch(filter, () => {
  page.value = 1;
  load();
});

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`
}

function reasonMeta(reason) {
  return RELEASE_REASON_META[reason] || { label: reason || '—', variant: 'outline', tone: null }
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(_sfc_main$k, null, {
    default: withCtx(() => [
      createBaseVNode("div", _hoisted_1$5, [
        createBaseVNode("div", _hoisted_2$3, [
          _cache[1] || (_cache[1] = createBaseVNode("h1", { class: "text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8" }, " 租约记录 ", -1)),
          createBaseVNode("div", _hoisted_3$3, [
            createVNode(_sfc_main$i, {
              modelValue: filter.value,
              "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((filter).value = $event)),
              options: FILTER_OPTIONS
            }, null, 8, ["modelValue"])
          ])
        ]),
        createVNode(_sfc_main$w, { class: "overflow-hidden" }, {
          default: withCtx(() => [
            createVNode(_sfc_main$h, { "min-width": "min-w-[800px]" }, {
              default: withCtx(() => [
                createVNode(_sfc_main$d, null, {
                  default: withCtx(() => [
                    createVNode(_sfc_main$c, null, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[2] || (_cache[2] = [
                            createTextVNode("领取人", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[3] || (_cache[3] = [
                            createTextVNode("账号", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[4] || (_cache[4] = [
                            createTextVNode("领取时间", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[5] || (_cache[5] = [
                            createTextVNode("最后操作", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[6] || (_cache[6] = [
                            createTextVNode("释放时间", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[7] || (_cache[7] = [
                            createTextVNode("释放原因", -1)
                          ]))]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                createVNode(_sfc_main$g, null, {
                  default: withCtx(() => [
                    (loading.value)
                      ? (openBlock(), createElementBlock(Fragment, { key: 0 }, renderList(4, (i) => {
                          return createVNode(_sfc_main$c, { key: i }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, { colspan: "6" }, {
                                default: withCtx(() => [
                                  createVNode(_sfc_main$v, { class: "h-6 w-full" })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        }), 64))
                      : (error.value)
                        ? (openBlock(), createBlock(_sfc_main$c, { key: 1 }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, {
                                colspan: "6",
                                class: "py-6 text-center text-mid-gray"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(error.value) + " ", 1),
                                  createVNode(_sfc_main$C, {
                                    variant: "outline",
                                    size: "sm",
                                    class: "ml-3",
                                    onClick: load
                                  }, {
                                    default: withCtx(() => [...(_cache[8] || (_cache[8] = [
                                      createTextVNode("重试", -1)
                                    ]))]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }))
                        : (items.value.length === 0)
                          ? (openBlock(), createBlock(_sfc_main$c, { key: 2 }, {
                              default: withCtx(() => [
                                createVNode(_sfc_main$f, {
                                  colspan: "6",
                                  class: "py-6 text-center text-mid-gray"
                                }, {
                                  default: withCtx(() => [...(_cache[9] || (_cache[9] = [
                                    createTextVNode("暂无租约记录", -1)
                                  ]))]),
                                  _: 1
                                })
                              ]),
                              _: 1
                            }))
                          : (openBlock(true), createElementBlock(Fragment, { key: 3 }, renderList(items.value, (lease) => {
                              return (openBlock(), createBlock(_sfc_main$c, {
                                key: lease.id
                              }, {
                                default: withCtx(() => [
                                  createVNode(_sfc_main$f, {
                                    class: normalizeClass(
                    lease.status === 'ACTIVE'
                      ? 'border-l-2 border-l-ink'
                      : 'border-l-2 border-l-transparent'
                  )
                                  }, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(lease.userDisplayName || '—'), 1)
                                    ]),
                                    _: 2
                                  }, 1032, ["class"]),
                                  createVNode(_sfc_main$f, { class: "font-medium tabular-nums" }, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(lease.accountCode), 1)
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, { class: "tabular-nums text-mid-gray" }, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(formatDate(lease.startedAt)), 1)
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, { class: "tabular-nums text-mid-gray" }, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(formatDate(lease.lastActivityAt)), 1)
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, { class: "tabular-nums text-mid-gray" }, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(lease.releasedAt ? formatDate(lease.releasedAt) : '—'), 1)
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, null, {
                                    default: withCtx(() => [
                                      (lease.releaseReason)
                                        ? (openBlock(), createBlock(_sfc_main$n, {
                                            key: 0,
                                            variant: reasonMeta(lease.releaseReason).variant || undefined,
                                            tone: reasonMeta(lease.releaseReason).tone || null
                                          }, {
                                            default: withCtx(() => [
                                              createTextVNode(toDisplayString(reasonMeta(lease.releaseReason).label), 1)
                                            ]),
                                            _: 2
                                          }, 1032, ["variant", "tone"]))
                                        : (openBlock(), createElementBlock("span", _hoisted_4$3, "—"))
                                    ]),
                                    _: 2
                                  }, 1024)
                                ]),
                                _: 2
                              }, 1024))
                            }), 128))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_5$3, [
          createBaseVNode("span", null, "共 " + toDisplayString(total.value) + " 条", 1),
          createBaseVNode("div", _hoisted_6$3, [
            createVNode(_sfc_main$C, {
              variant: "outline",
              size: "sm",
              disabled: page.value <= 1 || pending.value,
              onClick: goPrev
            }, {
              default: withCtx(() => [...(_cache[10] || (_cache[10] = [
                createTextVNode("上一页", -1)
              ]))]),
              _: 1
            }, 8, ["disabled"]),
            createBaseVNode("span", _hoisted_7$3, toDisplayString(page.value) + " / " + toDisplayString(totalPages.value), 1),
            createVNode(_sfc_main$C, {
              variant: "outline",
              size: "sm",
              disabled: page.value >= totalPages.value || pending.value,
              onClick: goNext
            }, {
              default: withCtx(() => [...(_cache[11] || (_cache[11] = [
                createTextVNode("下一页", -1)
              ]))]),
              _: 1
            }, 8, ["disabled"])
          ])
        ])
      ])
    ]),
    _: 1
  }))
}
}

};

const _hoisted_1$4 = ["aria-checked", "disabled"];

/**
 * 开关（§6.1）：ink 轨道 + paper 滑块（唯一「彩色感」元素，仍为黑白）。
 */

const _sfc_main$8 = {
  __name: 'Switch',
  props: {
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  class: { type: [String, Object, Array], default: undefined },
},
  emits: ['update:modelValue'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue);
}

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("button", {
    type: "button",
    role: "switch",
    "aria-checked": __props.modelValue,
    disabled: __props.disabled,
    class: normalizeClass(
      unref(cn)(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        __props.modelValue ? 'bg-ink' : 'border border-hairline bg-canvas',
        props.class,
      )
    ),
    onClick: toggle
  }, [
    createBaseVNode("span", {
      class: normalizeClass(
        unref(cn)(
          'pointer-events-none block h-4 w-4 rounded-full transition-transform',
          __props.modelValue ? 'translate-x-[22px] bg-paper' : 'translate-x-1 bg-mid-gray',
        )
      )
    }, null, 2)
  ], 10, _hoisted_1$4))
}
}

};

const _hoisted_1$3 = { class: "flex flex-col gap-6" };
const _hoisted_2$2 = { class: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" };
const _hoisted_3$2 = { class: "flex flex-wrap items-center gap-x-4 gap-y-3" };
const _hoisted_4$2 = { class: "flex items-center gap-2" };
const _hoisted_5$2 = { class: "w-full max-w-[12rem] sm:w-48" };
const _hoisted_6$2 = ["title"];
const _hoisted_7$2 = { class: "flex flex-wrap items-center justify-between gap-3 text-xs text-mid-gray" };
const _hoisted_8$2 = { class: "flex items-center gap-2" };
const _hoisted_9$2 = { class: "tabular-nums" };

const PAGE_SIZE = 10;

/** 筛选下拉：全量审计动作（英文 value + 中文 label），与后端 AUDIT_ACTION 全集对齐 */

const _sfc_main$7 = {
  __name: 'LogsPage',
  setup(__props) {

const ACTION_OPTIONS = [{ value: 'all', label: '全部' }].concat(
  Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
);

const loading = ref(true); // 初次加载 / 筛选变更 → 骨架屏
const pending = ref(false); // 翻页请求中 → 禁用按钮并保留当前行
const error = ref('');
const items = ref([]); // 当前页数据（来自后端）
const total = ref(0); // 后端过滤后的总条数
const actionFilter = ref('all');
const showActivity = ref(false);
const page = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

async function load(opts = {}) {
  if (opts.silent) pending.value = true;
  else loading.value = true;
  try {
    const res = await getAdminLogs({
      page: page.value,
      pageSize: PAGE_SIZE,
      action: actionFilter.value !== 'all' ? actionFilter.value : undefined,
      hideActivity: showActivity.value ? undefined : '1',
    });
    items.value = res.items || [];
    total.value = res.total ?? 0;
    error.value = '';
  } catch (e) {
    error.value = e?.message || '加载失败';
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
    pending.value = false;
  }
}

function goPrev() {
  if (page.value > 1) {
    page.value -= 1;
    load({ silent: true });
  }
}

function goNext() {
  if (page.value < totalPages.value) {
    page.value += 1;
    load({ silent: true });
  }
}

onMounted(load);

// 筛选条件变化（动作 / 显示 Activity）→ 回到第 1 页，由后端重新分页+过滤
watch([actionFilter, showActivity], () => {
  page.value = 1;
  load();
});

function formatDate(iso) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}:${ss}`
}

// 用户列：优先 users.display_name（后端 JOIN 返回），其次 username，未知 id 兜底 #id。
// 系统动作（定时回收/自动任务）user_id 为 null → 显示「系统」。
function userLabel(log) {
  if (log.userId == null) return '系统'
  return log.userDisplayName || log.userUsername || `#${log.userId}`
}

function resultMeta(result) {
  if (result === 'SUCCESS') return { label: '成功', variant: 'soft', tone: null }
  if (result === 'FAILED') return { label: '失败', variant: 'ember-outline', tone: null }
  return { label: '进行中', variant: 'outline', tone: null }
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(_sfc_main$k, null, {
    default: withCtx(() => [
      createBaseVNode("div", _hoisted_1$3, [
        createBaseVNode("div", _hoisted_2$2, [
          _cache[3] || (_cache[3] = createBaseVNode("h1", { class: "text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8" }, " 系统日志 ", -1)),
          createBaseVNode("div", _hoisted_3$2, [
            createBaseVNode("div", _hoisted_4$2, [
              _cache[2] || (_cache[2] = createBaseVNode("span", { class: "whitespace-nowrap text-xs text-mid-gray" }, "显示 Activity 明细", -1)),
              createVNode(_sfc_main$8, {
                modelValue: showActivity.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((showActivity).value = $event))
              }, null, 8, ["modelValue"])
            ]),
            createBaseVNode("div", _hoisted_5$2, [
              createVNode(_sfc_main$i, {
                modelValue: actionFilter.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = $event => ((actionFilter).value = $event)),
                options: unref(ACTION_OPTIONS)
              }, null, 8, ["modelValue", "options"])
            ])
          ])
        ]),
        createVNode(_sfc_main$w, { class: "overflow-hidden" }, {
          default: withCtx(() => [
            createVNode(_sfc_main$h, { "min-width": "min-w-[720px]" }, {
              default: withCtx(() => [
                createVNode(_sfc_main$d, null, {
                  default: withCtx(() => [
                    createVNode(_sfc_main$c, null, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[4] || (_cache[4] = [
                            createTextVNode("时间", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[5] || (_cache[5] = [
                            createTextVNode("动作", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[6] || (_cache[6] = [
                            createTextVNode("结果", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[7] || (_cache[7] = [
                            createTextVNode("用户", -1)
                          ]))]),
                          _: 1
                        }),
                        createVNode(_sfc_main$e, null, {
                          default: withCtx(() => [...(_cache[8] || (_cache[8] = [
                            createTextVNode("IP", -1)
                          ]))]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                createVNode(_sfc_main$g, null, {
                  default: withCtx(() => [
                    (loading.value)
                      ? (openBlock(), createElementBlock(Fragment, { key: 0 }, renderList(5, (i) => {
                          return createVNode(_sfc_main$c, { key: i }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, { colspan: "5" }, {
                                default: withCtx(() => [
                                  createVNode(_sfc_main$v, { class: "h-6 w-full" })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        }), 64))
                      : (error.value)
                        ? (openBlock(), createBlock(_sfc_main$c, { key: 1 }, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$f, {
                                colspan: "5",
                                class: "py-6 text-center text-mid-gray"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(error.value) + " ", 1),
                                  createVNode(_sfc_main$C, {
                                    variant: "outline",
                                    size: "sm",
                                    class: "ml-3",
                                    onClick: load
                                  }, {
                                    default: withCtx(() => [...(_cache[9] || (_cache[9] = [
                                      createTextVNode("重试", -1)
                                    ]))]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }))
                        : (items.value.length === 0)
                          ? (openBlock(), createBlock(_sfc_main$c, { key: 2 }, {
                              default: withCtx(() => [
                                createVNode(_sfc_main$f, {
                                  colspan: "5",
                                  class: "py-6 text-center text-mid-gray"
                                }, {
                                  default: withCtx(() => [...(_cache[10] || (_cache[10] = [
                                    createTextVNode("暂无日志", -1)
                                  ]))]),
                                  _: 1
                                })
                              ]),
                              _: 1
                            }))
                          : (openBlock(true), createElementBlock(Fragment, { key: 3 }, renderList(items.value, (log) => {
                              return (openBlock(), createBlock(_sfc_main$c, {
                                key: log.id
                              }, {
                                default: withCtx(() => [
                                  createVNode(_sfc_main$f, { class: "tabular-nums text-mid-gray" }, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(formatDate(log.createdAt)), 1)
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, null, {
                                    default: withCtx(() => [
                                      createBaseVNode("span", {
                                        title: log.action,
                                        class: "font-medium"
                                      }, toDisplayString(unref(actionLabelOf)(log.action, log.actionLabel)), 9, _hoisted_6$2)
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, null, {
                                    default: withCtx(() => [
                                      createVNode(_sfc_main$n, {
                                        variant: resultMeta(log.result).variant
                                      }, {
                                        default: withCtx(() => [
                                          createTextVNode(toDisplayString(resultMeta(log.result).label), 1)
                                        ]),
                                        _: 2
                                      }, 1032, ["variant"])
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, null, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(userLabel(log)), 1)
                                    ]),
                                    _: 2
                                  }, 1024),
                                  createVNode(_sfc_main$f, { class: "tabular-nums text-mid-gray" }, {
                                    default: withCtx(() => [
                                      createTextVNode(toDisplayString(log.ip || '—'), 1)
                                    ]),
                                    _: 2
                                  }, 1024)
                                ]),
                                _: 2
                              }, 1024))
                            }), 128))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_7$2, [
          createBaseVNode("span", null, "共 " + toDisplayString(total.value) + " 条", 1),
          createBaseVNode("div", _hoisted_8$2, [
            createVNode(_sfc_main$C, {
              variant: "outline",
              size: "sm",
              disabled: page.value <= 1 || pending.value,
              onClick: goPrev
            }, {
              default: withCtx(() => [...(_cache[11] || (_cache[11] = [
                createTextVNode("上一页", -1)
              ]))]),
              _: 1
            }, 8, ["disabled"]),
            createBaseVNode("span", _hoisted_9$2, toDisplayString(page.value) + " / " + toDisplayString(totalPages.value), 1),
            createVNode(_sfc_main$C, {
              variant: "outline",
              size: "sm",
              disabled: page.value >= totalPages.value || pending.value,
              onClick: goNext
            }, {
              default: withCtx(() => [...(_cache[12] || (_cache[12] = [
                createTextVNode("下一页", -1)
              ]))]),
              _: 1
            }, 8, ["disabled"])
          ])
        ])
      ])
    ]),
    _: 1
  }))
}
}

};

const _hoisted_1$2 = { class: "flex flex-col gap-6" };
const _hoisted_2$1 = { class: "p-4 sm:p-5" };
const _hoisted_3$1 = {
  key: 0,
  class: "mt-4 flex flex-col gap-3"
};
const _hoisted_4$1 = {
  key: 1,
  class: "mt-4 flex flex-col gap-4"
};
const _hoisted_5$1 = { class: "flex items-center gap-3" };
const _hoisted_6$1 = { class: "p-4 sm:p-5" };
const _hoisted_7$1 = { class: "mt-4 flex flex-wrap items-center gap-x-6 gap-y-4" };
const _hoisted_8$1 = { class: "text-sm" };
const _hoisted_9$1 = { class: "ml-2 font-medium tabular-nums text-ink" };
const _hoisted_10$1 = { class: "text-sm" };
const _hoisted_11$1 = { class: "ml-2 font-medium tabular-nums text-ink" };
const _hoisted_12$1 = { class: "mt-3 text-xs text-mid-gray" };
const _hoisted_13$1 = { class: "p-4 sm:p-5" };
const _hoisted_14$1 = { class: "flex flex-wrap items-center justify-between gap-3" };
const _hoisted_15$1 = { class: "mt-4 flex flex-col gap-3" };
const _hoisted_16$1 = { class: "min-w-0 flex-1 text-sm text-ink" };
const _hoisted_17$1 = {
  key: 0,
  class: "mt-3 text-xs leading-relaxed text-ember"
};
const _hoisted_18 = { class: "mt-4 flex items-center justify-between border-t border-hairline pt-4" };
const _hoisted_19 = { class: "text-xs tabular-nums text-mid-gray" };


const _sfc_main$6 = {
  __name: 'SettingsPage',
  setup(__props) {

const loading = ref(true);
const savingKey = ref('');
const checking = ref(false);

/** 租约规则表单元数据：驱动 v-for 渲染，保证三条规则的响应式行为完全一致 */
const RULES = [
  // 无操作超时以「分钟」为单位（2026-09-03 起，原秒；后端换算成秒做回收判定/倒计时下发）
  { key: 'inactivity_timeout_minutes', label: '无操作超时（分钟）' },
  { key: 'warning_seconds', label: '即将释放提醒（秒）' },
  { key: 'critical_warning_seconds', label: '临界提醒（秒）' },
];

const leaseRules = ref({
  inactivity_timeout_minutes: '30',
  warning_seconds: '300',
  critical_warning_seconds: '60',
});

const extensionConfig = ref({ minimumVersion: '1.0.0', latestVersion: '1.3.0' });
const health = ref({ lastCheckedAt: null, items: [] });

const healthOk = computed(() => health.value.items.length > 0 && health.value.items.every((i) => i.ok));

async function load() {
  try {
    const [settings, ext] = await Promise.all([getSettings(), getExtensionConfig()]);
    leaseRules.value = {
      inactivity_timeout_minutes: settings.inactivity_timeout_minutes ?? '30',
      warning_seconds: settings.warning_seconds ?? '300',
      critical_warning_seconds: settings.critical_warning_seconds ?? '60',
    };
    extensionConfig.value = ext;
  } catch (e) {
    toast({ title: e?.message || '加载失败', variant: 'destructive' });
  } finally {
    loading.value = false;
  }
}

function formatSize(bytes) {
  if (!bytes) return '—'
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** 下载浏览器扩展 ZIP（部署时由 deploy-lan 打包到 /downloads/scienceing-extension.zip）。 */
function onDownloadExtension() {
  if (!extensionPackage.available) {
    toast({ title: '扩展包尚未生成', description: '请先在部署机执行 deploy-lan 的 deploy / extension:pack', variant: 'destructive' });
    return
  }
  downloadExtensionZip();
  toast({ title: '开始下载', description: `扩展 ZIP v${extensionPackage.version || '—'}，解压后通过「加载已解压的扩展程序」安装` });
}

onMounted(() => {
  load();
  onCheck();
  loadExtensionPackage();
});

async function applyRule(key) {
  savingKey.value = key;
  try {
    await updateSettings({ [key]: leaseRules.value[key] });
    toast({ title: '已应用', variant: 'success' });
  } catch (e) {
    toast({ title: e?.message || '应用失败', variant: 'destructive' });
  } finally {
    savingKey.value = '';
  }
}

async function onCheck() {
  checking.value = true;
  try {
    // 45s 兜底：防止后端/Worker 异常时请求挂起导致按钮永远“检测中…”
    const result = await Promise.race([
      runHealthCheck(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('检测超时（>45s），请重试')), 45_000)),
    ]);
    health.value = result;
  } catch (e) {
    toast({ title: e?.message || '检测失败', variant: 'destructive' });
  } finally {
    checking.value = false;
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`
}

return (_ctx, _cache) => {
  return (openBlock(), createBlock(_sfc_main$k, { "content-width": "narrow" }, {
    default: withCtx(() => [
      createBaseVNode("div", _hoisted_1$2, [
        _cache[14] || (_cache[14] = createBaseVNode("h1", { class: "text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8" }, " 系统参数 ", -1)),
        createVNode(_sfc_main$w, null, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_2$1, [
              _cache[1] || (_cache[1] = createBaseVNode("h2", { class: "text-base font-semibold leading-6 text-ink" }, "租约规则", -1)),
              (loading.value)
                ? (openBlock(), createElementBlock("div", _hoisted_3$1, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(3, (i) => {
                      return createVNode(_sfc_main$v, {
                        key: i,
                        class: "h-9 w-full"
                      })
                    }), 64))
                  ]))
                : (openBlock(), createElementBlock("div", _hoisted_4$1, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(RULES, (rule) => {
                      return createBaseVNode("div", {
                        key: rule.key,
                        class: "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
                      }, [
                        createVNode(_sfc_main$s, { class: "sm:w-44 sm:shrink-0" }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(rule.label), 1)
                          ]),
                          _: 2
                        }, 1024),
                        createBaseVNode("div", _hoisted_5$1, [
                          createVNode(_sfc_main$t, {
                            modelValue: leaseRules.value[rule.key],
                            "onUpdate:modelValue": $event => ((leaseRules.value[rule.key]) = $event),
                            type: "number",
                            class: "w-full max-w-[140px] text-right tabular-nums"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                          createVNode(_sfc_main$C, {
                            variant: "outline",
                            size: "sm",
                            class: "shrink-0",
                            disabled: savingKey.value === rule.key,
                            onClick: $event => (applyRule(rule.key))
                          }, {
                            default: withCtx(() => [...(_cache[0] || (_cache[0] = [
                              createTextVNode(" 应用 ", -1)
                            ]))]),
                            _: 1
                          }, 8, ["disabled", "onClick"])
                        ])
                      ])
                    }), 64))
                  ]))
            ])
          ]),
          _: 1
        }),
        createVNode(_sfc_main$w, null, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_6$1, [
              _cache[10] || (_cache[10] = createBaseVNode("h2", { class: "text-base font-semibold leading-6 text-ink" }, "扩展配置", -1)),
              createBaseVNode("div", _hoisted_7$1, [
                createBaseVNode("div", _hoisted_8$1, [
                  _cache[2] || (_cache[2] = createBaseVNode("span", { class: "text-mid-gray" }, "最低版本", -1)),
                  createBaseVNode("span", _hoisted_9$1, toDisplayString(extensionConfig.value.minimumVersion), 1)
                ]),
                createBaseVNode("div", _hoisted_10$1, [
                  _cache[3] || (_cache[3] = createBaseVNode("span", { class: "text-mid-gray" }, "最新版本", -1)),
                  createBaseVNode("span", _hoisted_11$1, toDisplayString(extensionConfig.value.latestVersion), 1)
                ]),
                createVNode(_sfc_main$C, {
                  variant: "outline",
                  size: "sm",
                  disabled: !unref(extensionPackage).available,
                  onClick: onDownloadExtension
                }, {
                  default: withCtx(() => [...(_cache[4] || (_cache[4] = [
                    createTextVNode(" 下载最新版 ZIP ", -1)
                  ]))]),
                  _: 1
                }, 8, ["disabled"])
              ]),
              createBaseVNode("p", _hoisted_12$1, [
                (unref(extensionPackage).available)
                  ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      createTextVNode(" 分发包 v" + toDisplayString(unref(extensionPackage).version || '—') + " · " + toDisplayString(formatSize(unref(extensionPackage).size)) + " · 更新于 " + toDisplayString(unref(extensionPackage).updatedAt ? formatDate(unref(extensionPackage).updatedAt) : '—') + "； 同事下载后解压，在 Chrome 扩展页开启「开发者模式」→「加载已解压的扩展程序」选中解压目录即可。 ", 1)
                    ], 64))
                  : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                      _cache[5] || (_cache[5] = createTextVNode(" 分发包尚未生成：请在部署机执行 deploy-lan 的 ", -1)),
                      _cache[6] || (_cache[6] = createBaseVNode("code", { class: "rounded bg-surface-alt px-1" }, "deploy", -1)),
                      _cache[7] || (_cache[7] = createTextVNode(" 或 ", -1)),
                      _cache[8] || (_cache[8] = createBaseVNode("code", { class: "rounded bg-surface-alt px-1" }, "extension:pack", -1)),
                      _cache[9] || (_cache[9] = createTextVNode("，产物会自动放到 /downloads/scienceing-extension.zip。 ", -1))
                    ], 64))
              ])
            ])
          ]),
          _: 1
        }),
        createVNode(_sfc_main$w, null, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_13$1, [
              createBaseVNode("div", _hoisted_14$1, [
                _cache[11] || (_cache[11] = createBaseVNode("h2", { class: "text-base font-semibold leading-6 text-ink" }, "Scienceing 自动化", -1)),
                createVNode(_sfc_main$C, {
                  variant: "outline",
                  size: "sm",
                  disabled: checking.value,
                  onClick: onCheck
                }, {
                  default: withCtx(() => [
                    createTextVNode(toDisplayString(checking.value ? '检测中…' : '立即检测'), 1)
                  ]),
                  _: 1
                }, 8, ["disabled"])
              ]),
              createBaseVNode("div", _hoisted_15$1, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(health.value.items, (item) => {
                  return (openBlock(), createElementBlock("div", {
                    key: item.key,
                    class: "flex items-center gap-2.5"
                  }, [
                    createBaseVNode("span", {
                      class: "size-2 shrink-0 rounded-full",
                      style: normalizeStyle({ backgroundColor: item.ok ? '#16a34a' : '#e7000b' }),
                      "aria-hidden": "true"
                    }, null, 4),
                    createBaseVNode("span", _hoisted_16$1, toDisplayString(item.label), 1),
                    (item.ok)
                      ? (openBlock(), createBlock(_sfc_main$n, {
                          key: 0,
                          tone: "available",
                          class: "shrink-0"
                        }, {
                          default: withCtx(() => [...(_cache[12] || (_cache[12] = [
                            createTextVNode("正常", -1)
                          ]))]),
                          _: 1
                        }))
                      : (openBlock(), createBlock(_sfc_main$n, {
                          key: 1,
                          tone: "error",
                          class: "shrink-0"
                        }, {
                          default: withCtx(() => [...(_cache[13] || (_cache[13] = [
                            createTextVNode("异常", -1)
                          ]))]),
                          _: 1
                        }))
                  ]))
                }), 128))
              ]),
              (!healthOk.value && health.value.error)
                ? (openBlock(), createElementBlock("p", _hoisted_17$1, toDisplayString(health.value.error), 1))
                : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_18, [
                createVNode(_sfc_main$n, {
                  tone: healthOk.value ? 'available' : 'error'
                }, {
                  default: withCtx(() => [
                    createTextVNode(toDisplayString(healthOk.value ? '正常' : '异常'), 1)
                  ]),
                  _: 1
                }, 8, ["tone"]),
                createBaseVNode("p", _hoisted_19, "最后检测：" + toDisplayString(formatDate(health.value.lastCheckedAt)), 1)
              ])
            ])
          ]),
          _: 1
        })
      ])
    ]),
    _: 1
  }))
}
}

};

const _hoisted_1$1 = { class: "mb-4 text-xs font-medium leading-none text-mid-gray" };


const _sfc_main$5 = {
  __name: 'Section',
  props: {
  title: { type: String, required: true },
  class: { type: [String, Object, Array], default: undefined },
},
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("section", {
    class: normalizeClass(unref(cn)('mt-10 first:mt-0', props.class))
  }, [
    createBaseVNode("h2", _hoisted_1$1, toDisplayString(__props.title), 1),
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$4 = {
  __name: 'CardDescription',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("p", {
    class: normalizeClass(unref(cn)('text-sm text-mid-gray', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$3 = {
  __name: 'CardFooter',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: normalizeClass(unref(cn)('flex items-center gap-2 p-5 pt-0', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$2 = {
  __name: 'CardHeader',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: normalizeClass(unref(cn)('flex flex-col gap-1 p-5', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _sfc_main$1 = {
  __name: 'CardTitle',
  props: { class: { type: [String, Object, Array], default: undefined } },
  setup(__props) {

const props = __props;

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("h3", {
    class: normalizeClass(unref(cn)('text-base font-semibold leading-6 tracking-normal text-ink', props.class))
  }, [
    renderSlot(_ctx.$slots, "default")
  ], 2))
}
}

};

const _hoisted_1 = { class: "page-container py-8 sm:py-10" };
const _hoisted_2 = { class: "mb-8 flex flex-wrap items-start justify-between gap-4" };
const _hoisted_3 = { class: "flex items-center gap-2" };
const _hoisted_4 = { class: "flex flex-wrap items-center gap-x-6 gap-y-3" };
const _hoisted_5 = { class: "mt-4 flex flex-wrap items-center gap-3" };
const _hoisted_6 = { class: "flex flex-wrap gap-x-12 gap-y-6" };
const _hoisted_7 = { class: "mt-6 flex flex-wrap items-center gap-x-6 gap-y-4" };
const _hoisted_8 = { class: "w-48" };
const _hoisted_9 = { class: "flex flex-wrap items-center gap-3" };
const _hoisted_10 = { class: "flex flex-wrap items-center gap-3" };
const _hoisted_11 = { class: "grid max-w-lg gap-5" };
const _hoisted_12 = { class: "flex items-center gap-3" };
const _hoisted_13 = { class: "text-sm text-mid-gray" };
const _hoisted_14 = { class: "flex flex-col gap-4" };
const _hoisted_15 = { class: "mt-6 max-w-md" };
const _hoisted_16 = { class: "flex max-w-md flex-col gap-3" };
const _hoisted_17 = { class: "flex flex-wrap gap-3" };

const countdownSeconds = 27 * 60 + 46;


const _sfc_main = {
  __name: 'ComponentShowcase',
  setup(__props) {

const grayscale = ref(false);
const dialogOpen = ref(false);
const switchOn = ref(true);
const username = ref('');
const filter = ref('all');
const statusKinds = ['available', 'in_use', 'recycling', 'error', 'released'];

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '使用中' },
  { value: 'released', label: '已释放' },
];

return (_ctx, _cache) => {
  return (openBlock(), createElementBlock("div", {
    class: "min-h-screen w-full bg-canvas",
    style: normalizeStyle(grayscale.value ? 'filter: grayscale(1)' : undefined)
  }, [
    createBaseVNode("div", _hoisted_1, [
      createBaseVNode("div", _hoisted_2, [
        _cache[9] || (_cache[9] = createBaseVNode("div", { class: "min-w-0" }, [
          createBaseVNode("h1", { class: "text-[24px] font-semibold leading-tight tracking-[-0.75px] text-ink sm:text-[30px]" }, " 组件总览 "),
          createBaseVNode("p", { class: "mt-1 text-sm text-mid-gray" }, " Phase 0 · 设计系统与基础组件（Tailwind v4 + shadcn 主题映射） ")
        ], -1)),
        createBaseVNode("div", _hoisted_3, [
          _cache[8] || (_cache[8] = createBaseVNode("span", { class: "text-xs font-medium text-mid-gray" }, "灰度滤镜", -1)),
          createVNode(_sfc_main$8, {
            modelValue: grayscale.value,
            "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((grayscale).value = $event))
          }, null, 8, ["modelValue"])
        ])
      ]),
      createVNode(_sfc_main$5, { title: "状态语义（§4.1 · 彩色仅限状态标签）" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_4, [
            (openBlock(), createElementBlock(Fragment, null, renderList(statusKinds, (k) => {
              return createVNode(_sfc_main$x, {
                key: k,
                status: k
              }, null, 8, ["status"])
            }), 64))
          ]),
          createBaseVNode("div", _hoisted_5, [
            (openBlock(), createElementBlock(Fragment, null, renderList(statusKinds, (k) => {
              return createVNode(_sfc_main$n, {
                key: k,
                tone: k
              }, null, 8, ["tone"])
            }), 64))
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "Stat Block · Countdown" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_6, [
            createVNode(_sfc_main$y, {
              label: "可用",
              value: 6,
              dot: "#16a34a"
            }),
            createVNode(_sfc_main$y, {
              label: "使用中",
              value: 3,
              dot: "#2563eb"
            }),
            createVNode(_sfc_main$y, {
              label: "回收中",
              value: 1,
              dot: "#d97706"
            }),
            createVNode(_sfc_main$y, {
              label: "异常",
              value: 0,
              dot: "#e7000b"
            })
          ]),
          createBaseVNode("div", _hoisted_7, [
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[10] || (_cache[10] = [
                  createTextVNode("预计释放", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$q, {
                seconds: countdownSeconds,
                class: "mt-1 block text-2xl font-semibold text-ink"
              })
            ]),
            createBaseVNode("div", _hoisted_8, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[11] || (_cache[11] = [
                  createTextVNode("无操作时长", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$q, {
                seconds: 134,
                class: "mt-1 block text-2xl font-semibold text-ink"
              })
            ])
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "Badge · 黑白四变体" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_9, [
            createVNode(_sfc_main$n, { variant: "solid" }, {
              default: withCtx(() => [...(_cache[12] || (_cache[12] = [
                createTextVNode("solid", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$n, { variant: "soft" }, {
              default: withCtx(() => [...(_cache[13] || (_cache[13] = [
                createTextVNode("soft", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$n, { variant: "outline" }, {
              default: withCtx(() => [...(_cache[14] || (_cache[14] = [
                createTextVNode("outline", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$n, { variant: "ember-outline" }, {
              default: withCtx(() => [...(_cache[15] || (_cache[15] = [
                createTextVNode("ember-outline", -1)
              ]))]),
              _: 1
            })
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "Button" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_10, [
            createVNode(_sfc_main$C, null, {
              default: withCtx(() => [...(_cache[16] || (_cache[16] = [
                createTextVNode("主按钮", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, { variant: "secondary" }, {
              default: withCtx(() => [...(_cache[17] || (_cache[17] = [
                createTextVNode("次要按钮", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, { variant: "outline" }, {
              default: withCtx(() => [...(_cache[18] || (_cache[18] = [
                createTextVNode("描边按钮", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, { variant: "ghost" }, {
              default: withCtx(() => [...(_cache[19] || (_cache[19] = [
                createTextVNode("幽灵按钮", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, { variant: "destructive" }, {
              default: withCtx(() => [...(_cache[20] || (_cache[20] = [
                createTextVNode("危险操作", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, {
              variant: "outline",
              size: "sm"
            }, {
              default: withCtx(() => [...(_cache[21] || (_cache[21] = [
                createTextVNode("小按钮", -1)
              ]))]),
              _: 1
            })
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "Input · Select · Switch" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_11, [
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, { for: "demo-username" }, {
                default: withCtx(() => [...(_cache[22] || (_cache[22] = [
                  createTextVNode("用户名", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$t, {
                id: "demo-username",
                modelValue: username.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = $event => ((username).value = $event)),
                placeholder: "请输入用户名",
                class: "mt-1.5"
              }, null, 8, ["modelValue"])
            ]),
            createBaseVNode("div", null, [
              createVNode(_sfc_main$s, null, {
                default: withCtx(() => [...(_cache[23] || (_cache[23] = [
                  createTextVNode("状态筛选", -1)
                ]))]),
                _: 1
              }),
              createVNode(_sfc_main$i, {
                modelValue: filter.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = $event => ((filter).value = $event)),
                options: filterOptions,
                class: "mt-1.5 w-full max-w-xs"
              }, null, 8, ["modelValue"])
            ]),
            createBaseVNode("div", _hoisted_12, [
              createVNode(_sfc_main$8, {
                modelValue: switchOn.value,
                "onUpdate:modelValue": _cache[3] || (_cache[3] = $event => ((switchOn).value = $event))
              }, null, 8, ["modelValue"]),
              createBaseVNode("span", _hoisted_13, toDisplayString(switchOn.value ? '已开启' : '已关闭'), 1)
            ])
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "PasswordReveal · 遮蔽 / 显示 / 复制（30s 自动遮蔽）" }, {
        default: withCtx(() => [
          createVNode(_sfc_main$p, {
            password: "demo-placeholder",
            class: "max-w-md"
          })
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "PluginChip · ProgressHairline" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_14, [
            createVNode(_sfc_main$A, {
              state: "ready",
              version: "1.0.0"
            }),
            createVNode(_sfc_main$A, {
              state: "outdated",
              version: "1.0.0",
              "min-version": "1.1.0"
            }),
            createVNode(_sfc_main$A, { state: "missing" })
          ]),
          createBaseVNode("div", _hoisted_15, [
            createVNode(_sfc_main$s, null, {
              default: withCtx(() => [...(_cache[24] || (_cache[24] = [
                createTextVNode("使用时长占比", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$o, {
              value: 62,
              class: "mt-2"
            })
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "Skeleton" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_16, [
            createVNode(_sfc_main$v, { class: "h-9 w-full" }),
            createVNode(_sfc_main$v, { class: "h-9 w-3/4" }),
            createVNode(_sfc_main$v, { class: "h-9 w-1/2" })
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "Table" }, {
        default: withCtx(() => [
          createVNode(_sfc_main$w, { class: "overflow-hidden" }, {
            default: withCtx(() => [
              createVNode(_sfc_main$h, null, {
                default: withCtx(() => [
                  createVNode(_sfc_main$d, null, {
                    default: withCtx(() => [
                      createVNode(_sfc_main$c, null, {
                        default: withCtx(() => [
                          createVNode(_sfc_main$e, null, {
                            default: withCtx(() => [...(_cache[25] || (_cache[25] = [
                              createTextVNode("账号", -1)
                            ]))]),
                            _: 1
                          }),
                          createVNode(_sfc_main$e, null, {
                            default: withCtx(() => [...(_cache[26] || (_cache[26] = [
                              createTextVNode("状态", -1)
                            ]))]),
                            _: 1
                          }),
                          createVNode(_sfc_main$e, null, {
                            default: withCtx(() => [...(_cache[27] || (_cache[27] = [
                              createTextVNode("最后操作", -1)
                            ]))]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  createVNode(_sfc_main$g, null, {
                    default: withCtx(() => [
                      createVNode(_sfc_main$c, null, {
                        default: withCtx(() => [
                          createVNode(_sfc_main$f, { class: "font-medium" }, {
                            default: withCtx(() => [...(_cache[28] || (_cache[28] = [
                              createTextVNode("KY-01", -1)
                            ]))]),
                            _: 1
                          }),
                          createVNode(_sfc_main$f, null, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$n, { tone: "available" })
                            ]),
                            _: 1
                          }),
                          createVNode(_sfc_main$f, { class: "text-mid-gray" }, {
                            default: withCtx(() => [...(_cache[29] || (_cache[29] = [
                              createTextVNode("3 分钟前", -1)
                            ]))]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      createVNode(_sfc_main$c, null, {
                        default: withCtx(() => [
                          createVNode(_sfc_main$f, { class: "font-medium" }, {
                            default: withCtx(() => [...(_cache[30] || (_cache[30] = [
                              createTextVNode("KY-02", -1)
                            ]))]),
                            _: 1
                          }),
                          createVNode(_sfc_main$f, null, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$n, { tone: "in_use" })
                            ]),
                            _: 1
                          }),
                          createVNode(_sfc_main$f, { class: "text-mid-gray" }, {
                            default: withCtx(() => [...(_cache[31] || (_cache[31] = [
                              createTextVNode("28:04 后释放", -1)
                            ]))]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      createVNode(_sfc_main$c, null, {
                        default: withCtx(() => [
                          createVNode(_sfc_main$f, { class: "font-medium" }, {
                            default: withCtx(() => [...(_cache[32] || (_cache[32] = [
                              createTextVNode("KY-03", -1)
                            ]))]),
                            _: 1
                          }),
                          createVNode(_sfc_main$f, null, {
                            default: withCtx(() => [
                              createVNode(_sfc_main$n, { tone: "recycling" })
                            ]),
                            _: 1
                          }),
                          createVNode(_sfc_main$f, { class: "text-mid-gray" }, {
                            default: withCtx(() => [...(_cache[33] || (_cache[33] = [
                              createTextVNode("—", -1)
                            ]))]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          })
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "Dialog · Toast" }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_17, [
            createVNode(_sfc_main$C, {
              variant: "outline",
              onClick: _cache[4] || (_cache[4] = $event => (dialogOpen.value = true))
            }, {
              default: withCtx(() => [...(_cache[34] || (_cache[34] = [
                createTextVNode("打开确认弹窗", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, {
              variant: "outline",
              onClick: _cache[5] || (_cache[5] = $event => (unref(toast)({ title: '已保存', description: '设置已生效', variant: 'success' })))
            }, {
              default: withCtx(() => [...(_cache[35] || (_cache[35] = [
                createTextVNode(" 成功 Toast ", -1)
              ]))]),
              _: 1
            }),
            createVNode(_sfc_main$C, {
              variant: "outline",
              onClick: _cache[6] || (_cache[6] = $event => (unref(toast)({ title: '回收失败', description: '未找到「重置密码」按钮', variant: 'destructive' })))
            }, {
              default: withCtx(() => [...(_cache[36] || (_cache[36] = [
                createTextVNode(" 错误 Toast ", -1)
              ]))]),
              _: 1
            })
          ])
        ]),
        _: 1
      }),
      createVNode(_sfc_main$5, { title: "App Shell（侧边栏 #fafafa + 内容区 canvas）" }, {
        default: withCtx(() => [
          createVNode(_sfc_main$w, null, {
            default: withCtx(() => [
              createVNode(_sfc_main$2, null, {
                default: withCtx(() => [
                  createVNode(_sfc_main$1, null, {
                    default: withCtx(() => [...(_cache[37] || (_cache[37] = [
                      createTextVNode("管理后台布局", -1)
                    ]))]),
                    _: 1
                  }),
                  createVNode(_sfc_main$4, null, {
                    default: withCtx(() => [...(_cache[38] || (_cache[38] = [
                      createTextVNode("侧边栏 240px / 面包屑顶栏 / 内容区，见管理页。", -1)
                    ]))]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              createVNode(_sfc_main$3, null, {
                default: withCtx(() => [
                  createVNode(unref(RouterLink), { to: "/admin/accounts" }, {
                    default: withCtx(() => [
                      createVNode(_sfc_main$C, { variant: "secondary" }, {
                        default: withCtx(() => [...(_cache[39] || (_cache[39] = [
                          createTextVNode("查看 App Shell →", -1)
                        ]))]),
                        _: 1
                      })
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          })
        ]),
        _: 1
      })
    ]),
    createVNode(_sfc_main$B, {
      open: dialogOpen.value,
      "onUpdate:open": _cache[7] || (_cache[7] = $event => ((dialogOpen).value = $event)),
      title: "立即归还 KY-03",
      description: "归还后将重置密码并退出当前科应会话。",
      destructive: ""
    }, {
      footer: withCtx(({ close }) => [
        createVNode(_sfc_main$C, {
          variant: "outline",
          onClick: close
        }, {
          default: withCtx(() => [...(_cache[40] || (_cache[40] = [
            createTextVNode("取消", -1)
          ]))]),
          _: 1
        }, 8, ["onClick"]),
        createVNode(_sfc_main$C, {
          variant: "destructive",
          onClick: close
        }, {
          default: withCtx(() => [...(_cache[41] || (_cache[41] = [
            createTextVNode("确认归还", -1)
          ]))]),
          _: 1
        }, 8, ["onClick"])
      ]),
      _: 1
    }, 8, ["open"])
  ], 4))
}
}

};

/**
 * 路由（PRD §38）。
 * `/design` 为 Phase 0 组件总览（供设计走查）。
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/login', name: 'login', component: _sfc_main$r },
    { path: '/my', name: 'my', component: _sfc_main$m, meta: { requiresAuth: true } },
    { path: '/design', name: 'design', component: _sfc_main },
    // 使用手册：游客可读（只读渲染），管理员可在页内编辑。
    // 懒加载：markdown-it/DOMPurify 只在进入手册页时加载。
    { path: '/manual', name: 'manual', component: () => __vitePreload(() => import('./ManualPage-rBx3Vjrz.js'),true              ?[]:void 0) },
    { path: '/admin', redirect: '/admin/dashboard' },
    // 数据看板懒加载：echarts 体积较大，仅管理员访问看板时按需加载。
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => __vitePreload(() => import('./DashboardPage-2TKMPbf_.js'),true              ?[]:void 0),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    { path: '/admin/accounts', name: 'admin-accounts', component: _sfc_main$b, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/users', name: 'admin-users', component: _sfc_main$a, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/leases', name: 'admin-leases', component: _sfc_main$9, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/logs', name: 'admin-logs', component: _sfc_main$7, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/settings', name: 'admin-settings', component: _sfc_main$6, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !authState.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  // 非管理员访问 /admin/*：无访问权限，重定向首页（403 语义）
  if (to.meta.requiresAdmin && authState.user?.role !== 'ADMIN') {
    return { name: 'home' }
  }
  if (to.name === 'login' && authState.token) {
    return { name: 'home' }
  }
  return true
});

createApp(_sfc_main$D).use(router).mount('#app');

export { watch as A, onBeforeUnmount as B, normalizeStyle as C, shallowRef as D, getDashboardStats as E, Fragment as F, _sfc_main$k as G, _sfc_main$y as H, mergeProps as I, _sfc_main$n as J, toStatusKind as K, X, _sfc_main$z as _, createElementBlock as a, cn as b, createLucideIcon as c, onMounted as d, createBlock as e, createBaseVNode as f, getManual as g, createVNode as h, createCommentVNode as i, _sfc_main$C as j, createTextVNode as k, _sfc_main$w as l, _sfc_main$v as m, normalizeClass as n, openBlock as o, _sfc_main$t as p, renderList as q, ref as r, resolveDynamicComponent as s, toDisplayString as t, unref as u, computed as v, withCtx as w, toast as x, updateManual as y, authState as z };
