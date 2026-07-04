'use client';
/**
 * "Ask AI" panel (RFD 0009). Rendered only when /api/config advertises
 * aiEnabled; the fork runs perfectly LLM-less without it.
 */
import { Button, Column, Row, Text } from '@umami/react-zen';
import { useState } from 'react';
import { Panel } from '@/components/common/Panel';
import { useApi } from '@/components/hooks/useApi';
import { useConfig } from '@/components/hooks/useConfig';
import { Sparkles } from '@/components/icons';

const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CHARS = 4000;

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Exchange {
  question: string;
  answer: string;
  toolCalls: { name: string }[];
}

export function AskAiPanel({ websiteId }: { websiteId: string }) {
  // Fork (RFD 0009): aiEnabled is added to /api/config by the fork.
  const config = useConfig() as ({ aiEnabled?: boolean } & Record<string, any>) | null;
  const { post, useMutation } = useApi();
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [history, setHistory] = useState<HistoryMessage[]>([]);

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data: { websiteId: string; question: string; history: HistoryMessage[] }) =>
      post('/ai/query', data),
  });

  if (!config?.aiEnabled) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const q = question.trim();

    if (!q || isPending) {
      return;
    }

    mutate(
      { websiteId, question: q, history },
      {
        onSuccess: (result: { answer: string; toolCalls?: { name: string }[] }) => {
          const answer = result?.answer || 'No answer returned.';

          setExchanges(prev => [
            ...prev,
            { question: q, answer, toolCalls: result?.toolCalls ?? [] },
          ]);
          setHistory(prev =>
            [
              ...prev,
              { role: 'user' as const, content: q.slice(0, MAX_HISTORY_CHARS) },
              { role: 'assistant' as const, content: answer.slice(0, MAX_HISTORY_CHARS) },
            ].slice(-MAX_HISTORY_MESSAGES),
          );
          setQuestion('');
        },
      },
    );
  };

  return (
    <Panel>
      <Column gap="3">
        {exchanges.map((exchange, index) => (
          <Column
            key={index}
            gap="2"
            padding="3"
            backgroundColor="surface-sunken"
            borderRadius
            data-test="ask-ai-answer"
          >
            <Text weight="bold">{exchange.question}</Text>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{exchange.answer}</Text>
            {exchange.toolCalls.length > 0 && (
              <Text size="sm" color="muted">
                checked: {[...new Set(exchange.toolCalls.map(({ name }) => name))].join(', ')}
              </Text>
            )}
          </Column>
        ))}
        {error && (
          <Text color="red">
            {(error as Error)?.message || 'Something went wrong. Please try again.'}
          </Text>
        )}
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <Row gap="2" alignItems="center">
            <Sparkles size={16} style={{ flexShrink: 0 }} />
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={'Ask AI about this website’s traffic…'}
              maxLength={1000}
              disabled={isPending}
              aria-label="Ask AI about this website's traffic"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                font: 'inherit',
                color: 'inherit',
              }}
            />
            <Button type="submit" variant="primary" isDisabled={isPending || !question.trim()}>
              {isPending ? 'Thinking…' : 'Ask'}
            </Button>
          </Row>
        </form>
      </Column>
    </Panel>
  );
}
