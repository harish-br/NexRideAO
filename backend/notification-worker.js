/**
 * backend/notification-worker.js
 * Asynchronous background worker for processing the notification outbox.
 * Guarantees delivery reliability, idempotency, and controlled exponential backoff retry.
 */

import { notificationService } from './notification-service.js';

export class NotificationWorker {
  constructor({ maxRetries = 4, baseDelayMs = 500 } = {}) {
    this.queue = [];
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.isProcessing = false;
    this.seenEvents = new Set();
    this.processedEvents = new Set();
  }

  /**
   * Enqueues a notification delivery task into the outbox.
   */
  enqueue(task) {
    if (!task.eventId) {
      task.eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Idempotency: Reject if already enqueued or already processed
    if (this.seenEvents.has(task.eventId) || this.processedEvents.has(task.eventId)) {
      console.log(`[Worker] Skipping duplicate notification event: ${task.eventId}`);
      return false;
    }

    this.seenEvents.add(task.eventId);

    this.queue.push({
      ...task,
      attempts: 0,
      nextAttemptAt: Date.now()
    });

    console.log(`[Worker] Enqueued notification outbox task: ${task.eventId}`);
    this.processQueue();
    return true;
  }

  /**
   * Processes pending tasks in the outbox with backoff.
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const now = Date.now();
    const readyTasks = [];
    const remainingTasks = [];

    for (const task of this.queue) {
      if (task.nextAttemptAt <= now) {
        readyTasks.push(task);
      } else {
        remainingTasks.push(task);
      }
    }

    this.queue = remainingTasks;

    for (const task of readyTasks) {
      task.attempts++;
      try {
        if (task.type === 'broadcast') {
          await notificationService.broadcast(task.payload, task.authContext);
        } else if (task.recipientType === 'admin') {
          await notificationService.sendToAdmin(task.recipientId, task.payload);
        } else {
          await notificationService.sendToUser(task.recipientId, task.payload);
        }

        this.processedEvents.add(task.eventId);
        console.log(`[Worker] Successfully dispatched outbox task [${task.eventId}] on attempt ${task.attempts}`);
      } catch (err) {
        console.warn(`[Worker] Task [${task.eventId}] attempt ${task.attempts} failed: ${err.message}`);

        if (task.attempts < this.maxRetries) {
          const backoffDelay = this.baseDelayMs * Math.pow(2, task.attempts);
          task.nextAttemptAt = Date.now() + backoffDelay;
          this.queue.push(task);
          console.log(`[Worker] Task [${task.eventId}] scheduled for retry in ${backoffDelay}ms`);
        } else {
          console.error(`[Worker] Task [${task.eventId}] permanently failed after ${this.maxRetries} attempts`);
        }
      }
    }

    this.isProcessing = false;
  }
}

export const notificationWorker = new NotificationWorker();
