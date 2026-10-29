import React from 'react';
import { Dialog, DialogActions } from '../Dialog';
import { Button } from '../Button';
import type { DocStateApi } from '../../hooks/useDocState';
import { ru } from '../../data/strings';

interface DocDialogsProps {
  doc: DocStateApi;
  onLeave: () => void;
  onSaveAndLeave: () => void;
  onDelete: () => void;
}

export function DocDialogs({ doc, onLeave, onSaveAndLeave, onDelete }: DocDialogsProps) {
  const close = () => !doc.saving && doc.setDialog(null);
  return (
    <>
      <Dialog
        open={doc.dialog === 'leave'}
        onClose={close}
        size="sm"
        dismissOnOverlayClick={!doc.saving}
        title={ru.dialogs.leaveTitle}
        description={ru.dialogs.leaveBody}
        footer={
          <DialogActions align="between">
            <Button variant="ghost" size="compact" onClick={close}>
              {ru.dialogs.keep}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="compact" onClick={onLeave}>
                {ru.dialogs.leave}
              </Button>
              <Button size="compact" onClick={onSaveAndLeave} loading={doc.saving} disabled={!doc.canSave && !doc.saving}>
                {ru.dialogs.saveLeave}
              </Button>
            </div>
          </DialogActions>
        }
      >
        {!doc.canSave && !doc.saving && <p className="text-sm text-text-secondary">{ru.dialogs.cantSave}</p>}
      </Dialog>
      <Dialog
        open={doc.dialog === 'delete'}
        onClose={close}
        size="sm"
        title={ru.dialogs.deleteTitle(doc.title || ru.common.untitled)}
        description={ru.dialogs.deleteBody}
        footer={
          <DialogActions>
            <Button variant="secondary" size="compact" onClick={close}>
              {ru.common.cancel}
            </Button>
            <Button variant="danger" size="compact" onClick={onDelete}>
              {ru.dialogs.deleteNote}
            </Button>
          </DialogActions>
        }
      />
    </>
  );
}

