interface IdDisplayProps {
  id: string;
  prefix?: string;
}

export default function IdDisplay({ id }: IdDisplayProps) {
  // Simple display component for IDs (customer numbers, supplier numbers, etc.)
  // The id passed should already be the human-readable number (e.g., CUST-0001)
  return (
    <span className="text-sm text-gray-600 font-mono">
      {id}
    </span>
  );
}
