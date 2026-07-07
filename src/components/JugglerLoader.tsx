export function JugglerLoader({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="juggler-loader">
        <div className="juggler-head" />
        <div className="juggler-body" />
        <div className="juggler-arm juggler-arm-right" />
        <div className="juggler-arm juggler-arm-left" />
        <div className="juggler-ball juggler-ball-1" />
        <div className="juggler-ball juggler-ball-2" />
        <div className="juggler-ball juggler-ball-3" />
      </div>
    </div>
  );
}
