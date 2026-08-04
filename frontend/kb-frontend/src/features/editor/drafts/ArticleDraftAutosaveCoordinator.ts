import type { JSONContent } from '@tiptap/core'
import type { SaveArticleDraftRequest, SaveArticleDraftResponse } from '@/types/apps/articleDraftTypes'
import { isArticleDraftConflict } from '../../../lib/api/articleDraftsApi'

export type DraftSaveStatus = 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict'

export type DraftAutosaveSnapshot = {
  status: DraftSaveStatus
  dirty: boolean
  rowVersion: string
  error: unknown | null
}

type PendingContent = Pick<SaveArticleDraftRequest, 'content' | 'renderedHtml' | 'plainText'>

type AutosaveOptions = {
  rowVersion: string
  debounceMs?: number
  save: (request: SaveArticleDraftRequest) => Promise<SaveArticleDraftResponse>
  onStateChange?: (state: DraftAutosaveSnapshot) => void
  isConflict?: (error: unknown) => boolean
}

const DEFAULT_DEBOUNCE_MS = 1200

export class ArticleDraftAutosaveCoordinator {
  private readonly debounceMs: number
  private readonly save: AutosaveOptions['save']
  private readonly onStateChange?: AutosaveOptions['onStateChange']
  private readonly isConflict: NonNullable<AutosaveOptions['isConflict']>
  private rowVersion: string
  private latestContent: PendingContent | null = null
  private revision = 0
  private savedRevision = 0
  private status: DraftSaveStatus = 'saved'
  private error: unknown | null = null
  private conflict = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private saveLoop: Promise<boolean> | null = null
  private destroyed = false

  constructor(options: AutosaveOptions) {
    this.rowVersion = options.rowVersion
    this.debounceMs = Number.isFinite(options.debounceMs) && (options.debounceMs ?? 0) > 0
      ? options.debounceMs!
      : DEFAULT_DEBOUNCE_MS
    this.save = options.save
    this.onStateChange = options.onStateChange
    this.isConflict = options.isConflict ?? isArticleDraftConflict
  }

  get snapshot(): DraftAutosaveSnapshot {
    return {
      status: this.status,
      dirty: this.revision > this.savedRevision,
      rowVersion: this.rowVersion,
      error: this.error
    }
  }

  update(content: JSONContent, renderedHtml?: string, plainText?: string): void {
    if (this.destroyed) return

    this.latestContent = { content, renderedHtml, plainText }
    this.revision += 1
    this.error = null

    if (!this.conflict) {
      this.status = 'dirty'
      this.schedule()
    }

    this.emit()
  }

  retry(): Promise<boolean> {
    if (this.conflict || this.destroyed) return Promise.resolve(false)
    return this.flush()
  }

  flush(): Promise<boolean> {
    this.clearTimer()

    if (this.destroyed || this.conflict) return Promise.resolve(!this.snapshot.dirty)
    if (!this.snapshot.dirty) return Promise.resolve(true)
    if (this.saveLoop) {
      return this.saveLoop.then(saved => {
        if (this.snapshot.dirty && !this.conflict && !this.destroyed) return this.flush()
        return saved && !this.snapshot.dirty
      })
    }

    const loop = this.runSaveLoop()
    this.saveLoop = loop
    void loop.finally(() => {
      if (this.saveLoop === loop) this.saveLoop = null
    })
    return loop
  }

  destroy(): void {
    this.destroyed = true
    this.clearTimer()
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.debounceMs)
  }

  private async runSaveLoop(): Promise<boolean> {
    while (!this.destroyed && !this.conflict && this.latestContent && this.revision > this.savedRevision) {
      const requestRevision = this.revision
      const request: SaveArticleDraftRequest = {
        ...this.latestContent,
        rowVersion: this.rowVersion
      }

      this.status = 'saving'
      this.error = null
      this.emit()

      try {
        const response = await this.save(request)

        this.rowVersion = response.rowVersion
        this.savedRevision = Math.max(this.savedRevision, requestRevision)
        this.status = this.revision === requestRevision ? 'saved' : 'dirty'
        this.emit()
      } catch (error) {
        this.error = error
        this.conflict = this.isConflict(error)
        this.status = this.conflict ? 'conflict' : 'failed'
        this.emit()
        return false
      }
    }

    return !this.snapshot.dirty
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private emit(): void {
    this.onStateChange?.(this.snapshot)
  }
}
