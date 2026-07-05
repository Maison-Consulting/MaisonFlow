// Email notifications sent as the signed-in user via Microsoft Graph.
// Every function here is best-effort: callers should not let a rejection block
// the underlying task action. Emails only go out once the app registration has
// Mail.Send (delegated) granted + consented.
import { graphSendMail } from './graphClient.js';

const APP_URL = 'https://maison-consulting.github.io/MaisonFlow/';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function footer() {
  return `<p style="margin-top:16px;color:#888;font-size:12px">
    Open <a href="${APP_URL}">Maison Flow</a> to view the task.
  </p>`;
}

// Notify a resource that a task has been assigned to them.
export async function sendTaskAssignedEmail({ to, toName, taskTitle, projectName, assignedBy }) {
  if (!to) return;
  const subject = `Task assigned to you: ${taskTitle || 'Untitled task'}`;
  const html = `
    <p>Hi ${escapeHtml(toName || 'there')},</p>
    <p><b>${escapeHtml(assignedBy || 'Someone')}</b> assigned you a task${projectName ? ` on <b>${escapeHtml(projectName)}</b>` : ''}:</p>
    <p style="font-size:16px;font-weight:600">${escapeHtml(taskTitle || 'Untitled task')}</p>
    ${footer()}`;
  await graphSendMail({ to, subject, html });
}

// Notify a resource that they were @mentioned in a task's discussion.
export async function sendMentionEmail({ to, toName, taskTitle, projectName, mentionedBy, comment }) {
  if (!to) return;
  const subject = `You were mentioned on: ${taskTitle || 'a task'}`;
  const html = `
    <p>Hi ${escapeHtml(toName || 'there')},</p>
    <p><b>${escapeHtml(mentionedBy || 'Someone')}</b> mentioned you on task <b>${escapeHtml(taskTitle || 'Untitled task')}</b>${projectName ? ` (${escapeHtml(projectName)})` : ''}:</p>
    <blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;color:#444">${escapeHtml(comment || '')}</blockquote>
    ${footer()}`;
  await graphSendMail({ to, subject, html });
}
