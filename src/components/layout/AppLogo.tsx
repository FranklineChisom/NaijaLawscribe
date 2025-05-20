
import { Landmark } from 'lucide-react'; // Changed from Scale to Landmark for "VeriCourt"
import React from 'react';

export function AppLogo() {
  return (
    <div className="flex items-center gap-2 py-2">
      <Landmark className="h-8 w-8 text-primary" />
      <h1 className="text-2xl font-bold tracking-tight text-primary">VeriCourt</h1>
    </div>
  );
}
