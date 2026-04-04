import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';

interface MathCaptchaProps {
  /** Called when user solves the CAPTCHA correctly */
  onVerified: () => void;
  /** Reset trigger — increment to regenerate puzzle */
  resetKey?: number;
}

function generatePuzzle() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  // Mix of add/subtract to be slightly harder for bots
  const ops = ['+', '-'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  const answer = op === '+' ? a + b : a - b;
  return { question: `${a} ${op} ${b}`, answer };
}

export function MathCaptcha({ onVerified, resetKey }: MathCaptchaProps) {
  const [puzzle, setPuzzle] = useState(generatePuzzle);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [verified, setVerified] = useState(false);

  // Reset when parent requests (e.g. after a new login failure)
  useEffect(() => {
    setPuzzle(generatePuzzle());
    setInput('');
    setError(false);
    setVerified(false);
  }, [resetKey]);

  const refresh = useCallback(() => {
    setPuzzle(generatePuzzle());
    setInput('');
    setError(false);
  }, []);

  const handleSubmit = useCallback(() => {
    const parsed = parseInt(input, 10);
    if (parsed === puzzle.answer) {
      setVerified(true);
      setError(false);
      onVerified();
    } else {
      setError(true);
      // Generate a new puzzle on wrong answer
      setPuzzle(generatePuzzle());
      setInput('');
    }
  }, [input, puzzle.answer, onVerified]);

  if (verified) {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm font-medium py-2">
        <ShieldCheck className="w-4 h-4" />
        Verified — you may proceed
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <p className="text-sm text-amber-800 font-medium">
        Security check required — solve to continue
      </p>
      <div className="flex items-center gap-2">
        <span className="text-lg font-mono font-bold text-gray-800 select-none">
          {puzzle.question} =
        </span>
        <input
          type="number"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
          className={`w-20 px-2 py-1 border rounded text-center font-mono ${
            error ? 'border-red-400 bg-red-50' : 'border-gray-300'
          }`}
          placeholder="?"
          autoComplete="off"
          aria-label="CAPTCHA answer"
        />
        <button
          type="button"
          onClick={handleSubmit}
          className="px-3 py-1 bg-amber-600 text-white text-sm rounded hover:bg-amber-700"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={refresh}
          className="p-1 text-gray-400 hover:text-gray-600"
          title="New puzzle"
          aria-label="Generate new puzzle"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600">Wrong answer — try the new puzzle</p>
      )}
    </div>
  );
}
