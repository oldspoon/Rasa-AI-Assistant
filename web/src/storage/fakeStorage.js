// In-memory stand-in for localStorage / sessionStorage, for tests.
// Data lives in own properties so Object.keys() lists the stored keys, like the real thing.
export class FakeStorage {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null;
  }

  setItem(key, value) {
    this[key] = String(value);
  }

  removeItem(key) {
    delete this[key];
  }
}
