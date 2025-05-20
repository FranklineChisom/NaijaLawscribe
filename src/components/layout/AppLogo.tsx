import { Scale } from 'lucide-react';
import React from 'react';

export function AppLogo() {
  return (
    <div className="flex items-center gap-3 py-4">
      <Scale className="h-10 w-10 text-primary" />
      <h1 className="text-3xl font-bold tracking-tight text-primary">Naija Lawscribe</h1>
    </div>
  );
}
