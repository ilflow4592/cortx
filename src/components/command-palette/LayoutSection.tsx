/**
 * Layout toggle items (Toggle Sidebar / Toggle Right Panel).
 *
 * Returns a fragment of `PaletteItem`s rather than its own `Command.Group`,
 * so the parent decides which group these belong to (currently the global
 * Actions group, preserving the original single-section layout).
 */
import { PanelLeftClose, PanelRightClose } from 'lucide-react';
import { useT } from '../../i18n';
import { PaletteItem } from './PaletteItem';

interface Props {
  showAction: (label: string) => boolean;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  run: (fn: () => void) => void;
}

export function LayoutSection({ showAction, toggleSidebar, toggleRightPanel, run }: Props) {
  const t = useT();

  return (
    <>
      {showAction('Toggle Sidebar') && (
        <PaletteItem
          icon={<PanelLeftClose size={14} color="var(--fg-muted)" strokeWidth={1.5} />}
          label={t('action.toggleSidebar')}
          hint="⌘B"
          onSelect={() => run(toggleSidebar)}
        />
      )}
      {showAction('Toggle Right Panel') && (
        <PaletteItem
          icon={<PanelRightClose size={14} color="var(--fg-muted)" strokeWidth={1.5} />}
          label={t('action.toggleRightPanel')}
          hint="⌘⇧B"
          onSelect={() => run(toggleRightPanel)}
        />
      )}
    </>
  );
}
