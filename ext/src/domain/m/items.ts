/** Коллекция с сохранением типа наследника. */
export abstract class Items<T, Self extends Items<T, Self>> implements Iterable<T> {
  constructor(protected items: T[] = []) {}

  protected abstract wrap(items: T[]): Self;

  static from<T, S extends Items<T, S>>(this: new (items?: T[]) => S, items: T[]): S {
    return new this(items);
  }

  static empty<T, S extends Items<T, S>>(this: new () => S): S {
    return new this();
  }

  get length(): number {
    return this.items.length;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }

  at(i: number): T | undefined {
    return this.items[i];
  }

  first(): T | undefined {
    return this.items[0];
  }

  find(fn: (x: T) => boolean): T | undefined {
    return this.items.find(fn);
  }

  some(fn: (x: T, i: number) => boolean): boolean {
    return this.items.some(fn);
  }

  map<R>(fn: (x: T) => R): R[] {
    return this.items.map(fn);
  }

  filter(fn: (x: T) => boolean): Self {
    return this.wrap(this.items.filter(fn));
  }

  toArray(): T[] {
    return this.items;
  }
}
