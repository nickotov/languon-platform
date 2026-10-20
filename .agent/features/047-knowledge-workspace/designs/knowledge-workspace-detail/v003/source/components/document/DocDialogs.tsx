import React from 'react';
import { Dialog, DialogActions } from '../Dialog';
import { Button } from '../Button';
import type { DocStateApi } from '../../hooks/useDocState';

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
        title="Leave with unsaved edits?"
        description="Your working draft stays recovered privately, so you can pick up where you left off. The saved version in Knowledge — and any shared link — won’t include these edits until you Save."
        footer={
          <DialogActions align="between">
            <Button variant="ghost" size="compact" onClick={close}>
              Keep editing
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="compact" onClick={onLeave}>
                Leave without saving
              </Button>
              <Button size="compact" onClick={onSaveAndLeave} loading={doc.saving} disabled={!doc.canSave && !doc.saving}>
                Save and leave
              </Button>
            </div>
          </DialogActions>
        }
      >
        {!doc.canSave && !doc.saving && (
          <p className="text-sm text-text-secondary">Add a title and some text to be able to Save.</p>
        )}
      </Dialog>
      <Dialog
        open={doc.dialog === 'delete'}
        onClose={close}
        size="sm"
        title={`Delete “${doc.title || 'Untitled draft'}”?`}
        description="This removes the saved note, its working draft and revision history. A shared read-only link will stop working. Your tutor chats are not deleted."
        footer={
          <DialogActions>
            <Button variant="secondary" size="compact" onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" size="compact" onClick={onDelete}>
              Delete note
            </Button>
          </DialogActions>
        }
      />
    </>
  );
}

