import type { Track } from '../types';

/** A node stores a track and its links in both directions. */
export class Node<T> {
  next: Node<T> | null = null;
  prev: Node<T> | null = null;
  constructor(public value: T) {}
}

/** A generic doubly linked list used as the actual playback queue. */
export class DoublyLinkedList<T> {
  head: Node<T> | null = null;
  tail: Node<T> | null = null;
  private length = 0;
  current: Node<T> | null = null;

  get size(): number { return this.length; }
  get isEmpty(): boolean { return this.length === 0; }

  addFirst(value: T): Node<T> {
    const node = new Node(value);
    if (!this.head) this.tail = node;
    else { node.next = this.head; this.head.prev = node; }
    this.head = node; this.length += 1;
    if (!this.current) this.current = node;
    return node;
  }

  addLast(value: T): Node<T> {
    const node = new Node(value);
    if (!this.tail) this.head = node;
    else { node.prev = this.tail; this.tail.next = node; }
    this.tail = node; this.length += 1;
    if (!this.current) this.current = node;
    return node;
  }

  /** Insert at a zero-based position. Position === size appends. */
  insertAt(value: T, position: number): Node<T> {
    this.assertPosition(position, true);
    if (position === 0) return this.addFirst(value);
    if (position === this.length) return this.addLast(value);
    const next = this.nodeAt(position)!;
    const node = new Node(value);
    node.prev = next.prev; node.next = next;
    next.prev!.next = node; next.prev = node;
    this.length += 1;
    return node;
  }

  /** Remove by zero-based position and keep the current pointer valid. */
  removeAt(position: number): T | null {
    if (position < 0 || position >= this.length) return null;
    const node = this.nodeAt(position)!;
    const successor = node.next ?? node.prev;
    if (node.prev) node.prev.next = node.next; else this.head = node.next;
    if (node.next) node.next.prev = node.prev; else this.tail = node.prev;
    if (this.current === node) this.current = successor;
    node.next = null; node.prev = null; this.length -= 1;
    if (this.length === 0) this.current = null;
    return node.value;
  }

  removeById(id: string): T | null {
    let position = 0;
    for (let node = this.head; node; node = node.next, position += 1) {
      if ((node.value as { id?: string }).id === id) return this.removeAt(position);
    }
    return null;
  }

  moveNext(loop = false): Node<T> | null {
    if (this.current?.next) this.current = this.current.next;
    else if (loop) this.current = this.head;
    return this.current;
  }

  movePrevious(loop = false): Node<T> | null {
    if (this.current?.prev) this.current = this.current.prev;
    else if (loop) this.current = this.tail;
    return this.current;
  }

  setCurrentById(id: string): Node<T> | null {
    for (let node = this.head; node; node = node.next) {
      if ((node.value as { id?: string }).id === id) { this.current = node; return node; }
    }
    return null;
  }

  nodeAt(position: number): Node<T> | null {
    if (position < 0 || position >= this.length) return null;
    if (position < this.length / 2) {
      let node = this.head;
      for (let i = 0; i < position && node; i += 1) node = node.next;
      return node;
    }
    let node = this.tail;
    for (let i = this.length - 1; i > position && node; i -= 1) node = node.prev;
    return node;
  }

  indexOfId(id: string): number {
    let index = 0;
    for (let node = this.head; node; node = node.next, index += 1) {
      if ((node.value as { id?: string }).id === id) return index;
    }
    return -1;
  }

  clear(): void { this.head = null; this.tail = null; this.current = null; this.length = 0; }

  /** Snapshot for React rendering; navigation and mutations stay node based. */
  toArray(): T[] {
    const items: T[] = [];
    for (let node = this.head; node; node = node.next) items.push(node.value);
    return items;
  }

  private assertPosition(position: number, allowEnd: boolean): void {
    const upperBound = allowEnd ? this.length : this.length - 1;
    if (!Number.isInteger(position) || position < 0 || position > upperBound) {
      throw new RangeError(`Position must be an integer between 0 and ${upperBound}.`);
    }
  }
}

/** Convenience specialization documents the queue's domain model. */
export type TrackQueue = DoublyLinkedList<Track>;
