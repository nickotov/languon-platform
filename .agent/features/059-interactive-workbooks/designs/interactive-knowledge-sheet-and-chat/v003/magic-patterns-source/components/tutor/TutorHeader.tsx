import React from 'react';
import {
  ChevronDownIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  HistoryIcon,
  MinusIcon,
  EllipsisVerticalIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SquarePenIcon,
  Trash2Icon,
} from 'lucide-react';
import type { Conversation, SourceInfo } from '../../types/tutor';
import { IconButton } from '../IconButton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import { TutorMark } from './TutorMark';
import { ContextIndicator } from './ContextIndicator';
import { useTutorContext } from '../../contexts/TutorContext';
import { FULL_HEIGHT } from '../../types/app';

interface TutorHeaderProps {
  conversation: Conversation;
  source: SourceInfo;
  pageSourceId: string;
  onFold: () => void;
  onRequestDelete: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function TutorHeader({ conversation, source, pageSourceId, onFold, onRequestDelete, onPointerDown }: TutorHeaderProps) {
  const { tutor, ui, platform, setDock, setUi, setSheet, canWiden } = useTutorContext();
  const mobile = platform === 'mobile';
  const btnSize = mobile ? 'lg' : 'sm';
  const otherDock = ui.dock === 'right' ? 'left' : 'right';
  const historyOpen = tutor.state.view === 'history';

  return (
    <div
      onPointerDown={onPointerDown}
      className={`flex items-center gap-2 border-b border-border-default px-3 ${mobile ? 'touch-none py-1' : 'cursor-grab py-2.5 active:cursor-grabbing'}`}
    >
      {!mobile && <TutorMark />}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold leading-5 text-text-primary">Language tutor</h2>
        <ContextIndicator conversation={conversation} source={source} pageSourceId={pageSourceId} />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {!mobile && (
          <IconButton icon={<SquarePenIcon />} label="New conversation" variant="ghost" size={btnSize} tooltipPlacement="bottom" onClick={() => tutor.newConversation(pageSourceId)} />
        )}
        <DropdownMenu
          align="end"
          trigger={
            <DropdownMenuTrigger
              hideChevron
              aria-label="More options"
              className={`inline-flex items-center justify-center rounded-lg !border-0 !bg-transparent !p-0 !shadow-none text-text-secondary hover:!bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? '!h-12 !w-12' : '!h-8 !w-8'}`}
            >
              <EllipsisVerticalIcon className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
          }
          menuClassName="w-60"
        >
          <DropdownMenuLabel>Conversation</DropdownMenuLabel>
          <DropdownMenuItem
            icon={<HistoryIcon className="h-4 w-4" />}
            onSelect={() => tutor.setView(historyOpen ? 'chat' : 'history')}
          >
            {historyOpen ? 'Back to chat' : 'Conversation history'}
          </DropdownMenuItem>
          {mobile && (
            <DropdownMenuItem icon={<SquarePenIcon className="h-4 w-4" />} onSelect={() => tutor.newConversation(pageSourceId)}>
              New conversation
            </DropdownMenuItem>
          )}
          {!mobile && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Layout</DropdownMenuLabel>
              <DropdownMenuItem
                icon={otherDock === 'left' ? <PanelLeftIcon className="h-4 w-4" /> : <PanelRightIcon className="h-4 w-4" />}
                onSelect={() => setDock(otherDock)}
              >
                Move to upper {otherDock}
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={ui.wide} disabled={!canWiden} onCheckedChange={(v: boolean) => setUi({ wide: v })}>
                Wider reading size{!canWiden ? ' (needs more space)' : ''}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={ui.widgetHeight === FULL_HEIGHT}
                onCheckedChange={(v: boolean) => setUi({ widgetHeight: v ? FULL_HEIGHT : null })}
              >
                Full available height
              </DropdownMenuCheckboxItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive icon={<Trash2Icon className="h-4 w-4" />} disabled={conversation.messages.length === 0} onSelect={onRequestDelete}>
            Delete conversation…
          </DropdownMenuItem>
        </DropdownMenu>
        {mobile && (
          <IconButton
            icon={ui.sheet === 'full' ? <ChevronsDownIcon /> : <ChevronsUpIcon />}
            label={ui.sheet === 'full' ? 'Reduce to partial height' : 'Expand to full height'}
            variant="ghost"
            size={btnSize}
            showTooltip={false}
            onClick={() => setSheet(ui.sheet === 'full' ? 'partial' : 'full')}
          />
        )}
        <IconButton
          icon={mobile ? <ChevronDownIcon /> : <MinusIcon />}
          label="Minimize tutor"
          variant="ghost"
          size={btnSize}
          tooltipPlacement="bottom"
          showTooltip={!mobile}
          onClick={onFold}
        />
      </div>
    </div>
  );
}

