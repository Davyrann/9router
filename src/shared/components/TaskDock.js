"use client";

import { useState } from "react";
import LongTaskBanner from "./LongTaskBanner";
import { useTaskStore } from "@/store/taskStore";

/**
 * Renders every running long task above the dashboard, mounted once in the
 * dashboard layout so navigation never unmounts it.
 *
 * The newest task starts in the foreground; anything the operator has collapsed
 * (and the older tasks behind it) renders as a corner chip. Each banner owns its
 * own collapsed state, so backgrounding one is local and survives an update to
 * the task, and the tasks keep reporting progress while the operator navigates.
 */
export default function TaskDock() {
  const tasks = useTaskStore((s) => s.tasks);
  if (!tasks.length) return null;

  return (
    <>
      {tasks.map((task, index) => (
        <DockBanner key={task.id} task={task} startForeground={index === 0} />
      ))}
    </>
  );
}

/** One task = one banner. startBackgrounded skips straight to the corner chip. */
function DockBanner({ task, startForeground }) {
  const [backgrounded, setBackgrounded] = useState(!startForeground);

  if (backgrounded) {
    return (
      <LongTaskBanner
        chipOnly
        fixed={false}
        title={task.title}
        message={task.message}
        progress={task.progress ?? null}
        canCancel
        onCancel={() => useTaskStore.getState().cancel(task.id)}
        onExpand={() => setBackgrounded(false)}
      />
    );
  }

  return (
    <LongTaskBanner
      fixed
      title={task.title}
      message={task.message}
      section={task.section}
      progress={task.progress ?? null}
      onCancel={() => useTaskStore.getState().cancel(task.id)}
      onBackground={() => setBackgrounded(true)}
    />
  );
}