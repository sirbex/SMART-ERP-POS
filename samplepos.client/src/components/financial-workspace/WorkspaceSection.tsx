import type { ReactNode } from 'react';

interface Props {
    step?: number;
    title: string;
    subtitle?: string;
    children: ReactNode;
    sectionRef?: React.RefObject<HTMLElement | null>;
}

export function WorkspaceSection({ step, title, subtitle, children, sectionRef }: Props) {
    return (
        <div ref={sectionRef as React.RefObject<HTMLDivElement | null>} className="mb-2">
            {(step != null || subtitle) && (
                <div className="px-1 mb-2 flex items-baseline gap-2">
                    {step != null && (
                        <span className="text-xs font-bold text-slate-400 tabular-nums">{step}.</span>
                    )}
                    <div>
                        {subtitle && <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>}
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}
