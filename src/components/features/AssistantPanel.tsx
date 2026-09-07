import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Plus,
  Send,
  ServerCrash,
  ShieldQuestion,
  Sparkles,
  Square,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';

import { useAgentChat } from '@/hooks/useAgentChat';
import { cn } from '@/lib/utils';
import { useUi } from '@/store/ui';
import type { AgentMessage, AgentToolCall, PermissionMode } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

/* ----------------------------- tiny markdown ------------------------------- */

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b${key++}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${key++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** Renders fenced code blocks plus bold/inline-code. Deliberately tiny — no HTML injection. */
function RichText({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/```/), [text]);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          // Strip an optional language hint from the first line.
          const newline = block.indexOf('\n');
          const first = block.slice(0, newline === -1 ? block.length : newline).trim();
          const rest = newline === -1 ? '' : block.slice(newline + 1);
          const looksLikeLang = /^[a-z0-9+#-]+$/i.test(first) && newline !== -1;
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed"
            >
              {looksLikeLang ? rest : block}
            </pre>
          );
        }
        if (!block.trim()) return null;
        return (
          <p key={index} className="whitespace-pre-wrap text-[13px] leading-relaxed">
            {renderInline(block, `b${index}`)}
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------- tool calls -------------------------------- */

function ToolCallChip({ call }: { call: AgentToolCall }) {
  const [open, setOpen] = useState(false);
  const isRunning = call.status === 'running';

  return (
    <div
      className={cn(
        'rounded-lg border text-xs',
        isRunning
          ? 'border-warning/30 bg-warning/10'
          : call.status === 'error'
            ? 'border-destructive/30 bg-destructive/10'
            : 'border-border/60 bg-muted/30',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {isRunning ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-warning" aria-hidden="true" />
        ) : (
          <Wrench className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{call.name}</span>
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-border/50 px-2.5 py-2">
          {call.input && (
            <pre className="max-h-32 overflow-auto font-mono text-[10px] text-muted-foreground">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          )}
          {call.result && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-foreground/80">
              {call.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- message --------------------------------- */

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}
    >
      <span
        className={cn(
          'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg border',
          isUser
            ? 'border-border/60 bg-muted/50 text-foreground'
            : 'border-primary/30 bg-primary/10 text-primary',
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </span>

      <div
        className={cn(
          'min-w-0 max-w-[85%] space-y-2 rounded-xl border px-3 py-2',
          isUser
            ? 'border-primary/25 bg-primary/10'
            : 'border-border/60 bg-card/70',
        )}
      >
        {message.content ? (
          <RichText text={message.content} />
        ) : (
          message.streaming && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Thinking…
            </span>
          )
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((call) => (
              <ToolCallChip key={call.id} call={call} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------- permissions -------------------------------- */

const PERMISSION_MODES: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Ask every time' },
  { value: 'acceptEdits', label: 'Auto-accept edits' },
  { value: 'plan', label: 'Plan only' },
  { value: 'bypassPermissions', label: 'Bypass (trusted)' },
];

/* ---------------------------------- panel ---------------------------------- */

export function AssistantPanel() {
  const open = useUi((s) => s.assistantOpen);
  const setOpen = useUi((s) => s.setAssistantOpen);

  const chat = useAgentChat();
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isBusy = chat.status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const text = draft.trim();
    if (!text || isBusy) return;
    setDraft('');
    void chat.send(text);
  };

  return (
    <motion.aside
      role="complementary"
      aria-label="Checksum assistant"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="fixed right-0 top-0 z-40 flex h-full w-full max-w-lg flex-col border-l border-border/60 bg-card/95 backdrop-blur-xl"
    >
      {/* header */}
      <header className="space-y-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Checksum assistant</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {chat.status === 'offline'
                ? 'Backend offline'
                : chat.sessionId
                  ? `Session ${chat.sessionId.slice(0, 8)}`
                  : 'New conversation'}
            </p>
          </div>

          <Button variant="ghost" size="icon-sm" aria-label="New conversation" onClick={chat.newChat}>
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={showHistory ? 'Hide history' : 'Show history'}
            aria-expanded={showHistory}
            onClick={() => setShowHistory((value) => !value)}
          >
            <History className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={chat.model} onValueChange={chat.setModel} disabled={chat.status === 'offline'}>
            <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {chat.models.map((model) => (
                <SelectItem key={model.modelId} value={model.modelId}>
                  {model.name || model.modelId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={chat.permissionMode}
            onValueChange={(value) => chat.setPermissionMode(value as PermissionMode)}
            disabled={chat.status === 'offline'}
          >
            <SelectTrigger className="h-8 w-[152px] text-xs" aria-label="Permission mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AnimatePresence initial={false}>
          {showHistory && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {chat.sessions.length === 0 ? (
                <p className="py-2 text-[11px] text-muted-foreground">No saved conversations yet.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto py-1">
                  {chat.sessions.map((session) => (
                    <li key={session.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void chat.selectSession(session.id)}
                        className={cn(
                          'min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-[11px] transition-colors',
                          session.id === chat.sessionId
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                        )}
                      >
                        {session.title || 'Untitled conversation'}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${session.title}`}
                        onClick={() => void chat.removeSession(session.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* body */}
      <ScrollArea className="flex-1 px-4 py-4">
        {chat.status === 'checking' && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        )}

        {chat.status === 'offline' && (
          <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-warning">
              <ServerCrash className="size-4" aria-hidden="true" />
              Agent backend offline
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Hashing still works — it is entirely client-side. To enable the assistant, start the
              API server and reload:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-2.5 font-mono text-[11px]">
              npm run dev:server
            </pre>
            <p className="text-xs text-muted-foreground">
              Set <code className="font-mono">CODEBUDDY_API_KEY</code> in{' '}
              <code className="font-mono">.env</code> first (see{' '}
              <code className="font-mono">.env.example</code>).
            </p>
          </div>
        )}

        {chat.status !== 'checking' && chat.status !== 'offline' && chat.messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Ask about checksum formats, mismatches, or the commands that produce them. The
              assistant cannot read your files — it only sees what you paste.
            </p>
            {[
              'My SHA-256 digest does not match. What should I check first?',
              'How do I generate a SHA256SUMS file on macOS?',
              'Is MD5 good enough to check a downloaded ISO?',
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void chat.send(suggestion)}
                className="block w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {chat.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>

        {chat.activity && (
          <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Running <span className="font-mono">{chat.activity}</span>…
          </p>
        )}

        {chat.error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{chat.error}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Dismiss error" onClick={chat.clearError}>
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        {/* inline permission request */}
        <AnimatePresence>
          {chat.pendingPermission && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="mt-4 space-y-2 rounded-xl border border-primary/40 bg-primary/10 p-3"
            >
              <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                <ShieldQuestion className="size-4" aria-hidden="true" />
                Permission requested
              </p>
              <p className="text-xs text-muted-foreground">
                The agent wants to run{' '}
                <code className="font-mono text-[11px] text-foreground">
                  {chat.pendingPermission.toolName}
                </code>
                .
              </p>
              {chat.pendingPermission.input && (
                <pre className="max-h-28 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-[10px]">
                  {JSON.stringify(chat.pendingPermission.input, null, 2)}
                </pre>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => chat.resolvePermission(true)}>
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => chat.resolvePermission(false)}
                >
                  Deny
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </ScrollArea>

      {/* composer */}
      <footer className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            disabled={chat.status === 'offline' || chat.status === 'checking'}
            placeholder={
              chat.status === 'offline'
                ? 'Assistant unavailable — backend offline'
                : 'Ask about checksums…  (Enter to send, Shift+Enter for a new line)'
            }
            rows={2}
            aria-label="Message the checksum assistant"
            className="max-h-40 min-h-[52px] resize-none"
          />
          {isBusy ? (
            <Button size="icon" variant="outline" aria-label="Stop generating" onClick={chat.stop}>
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              aria-label="Send message"
              onClick={submit}
              disabled={!draft.trim() || chat.status !== 'ready'}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>

        <p className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>Conversations are stored locally in SQLite.</span>
          {chat.sessionId && <Badge variant="muted">messages: {chat.messages.length}</Badge>}
        </p>
      </footer>
    </motion.aside>
  );
}
