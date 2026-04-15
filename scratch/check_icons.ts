import * as LucideIcons from 'lucide-react';

console.log('Panda exist?', !!(LucideIcons as any).Panda);
console.log('Monkey exist?', !!(LucideIcons as any).Monkey);
console.log('Bear exist?', !!(LucideIcons as any).Bear);
console.log('Icons available:', Object.keys(LucideIcons).filter(k => k.length < 10).slice(0, 20));
