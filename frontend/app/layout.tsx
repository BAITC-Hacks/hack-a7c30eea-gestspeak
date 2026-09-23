import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'GestSpeak — решения остаются', icons: { icon: '/favicon.svg' }, description: 'Локальный ИИ-ассистент совещаний. Транскрипт, поручения и протокол на русском и казахском.' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
 return <html lang="ru"><body>{children}</body></html>;
}
