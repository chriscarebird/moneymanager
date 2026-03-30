type StatusMessageProps = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
};

export function StatusMessage({ status, message }: StatusMessageProps) {
  if (status === 'idle' || !message) return null;

  const styles = {
    loading: 'bg-blue-900 border-blue-700 text-blue-200',
    success: 'bg-green-900 border-green-700 text-green-200',
    error: 'bg-red-900 border-red-700 text-red-200',
  } as const;

  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${styles[status]}`}>
      {status === 'loading' && <span className="mr-2">⏳</span>}
      {status === 'success' && <span className="mr-2">✓</span>}
      {status === 'error' && <span className="mr-2">✗</span>}
      {message}
    </div>
  );
}
