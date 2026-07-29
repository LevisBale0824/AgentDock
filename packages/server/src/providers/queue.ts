// 简易 AsyncQueue：让回调驱动型逻辑（SDK 回调 / SSE 事件流）能驱动 async generator

export class AsyncQueue<T> {
  private buf: T[] = []
  private waiters: Array<(v: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: item, done: false })
    else this.buf.push(item)
  }

  close(): void {
    this.closed = true
    while (this.waiters.length) this.waiters.shift()!({ value: undefined as any, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buf.length > 0) {
          return Promise.resolve({ value: this.buf.shift()!, done: false })
        }
        if (this.closed) return Promise.resolve({ value: undefined as any, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}
