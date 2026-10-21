import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import { Dialog, DialogActions } from '../Dialog';
import { InlineAlert } from '../InlineAlert';
import { usePrototype } from '../../contexts/PrototypeContext';

interface DeletePortraitDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DeletePortraitDialog({ open, onClose }: DeletePortraitDialogProps) {
  const { deletePortrait, showToast, interview } = usePrototype();
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'pending' | 'error'>('idle');

  const close = () => {
    if (state === 'pending') return;
    setState('idle');
    onClose();
  };

  const confirm = async () => {
    setState('pending');
    const ok = await deletePortrait();
    if (ok) {
      setState('idle');
      onClose();
      showToast({ variant: 'success', title: 'Portrait deleted', description: 'Chats no longer use it. Your chat history is unchanged.' });
      navigate('/portrait');
    } else {
      setState('error');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Delete your learner portrait?"
      description="This can’t be undone."
      size="sm"
      dismissOnOverlayClick={state !== 'pending'}
      dismissOnEscape={state !== 'pending'}
      showCloseButton={state !== 'pending'}
      footer={
        <DialogActions>
          <Button variant="secondary" onClick={close} disabled={state === 'pending'}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={state === 'pending'}>
            {state === 'error' ? 'Try deleting again' : 'Delete portrait'}
          </Button>
        </DialogActions>
      }
    >
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text-secondary">
        <li>Removes all saved portrait information.</li>
        {interview ? <li>Removes your unfinished interview and its draft.</li> : <li>Removes any unfinished interview and draft.</li>}
        <li>Stops chats from using your portrait.</li>
        <li>Leaves your ordinary chat history as it is, including anything you shared in earlier messages.</li>
      </ul>
      <p className="mt-3 text-sm text-text-secondary">
        Only want to pause it? Turn off <span className="font-medium text-text-primary">Use my portrait</span> instead. Your information stays saved.
      </p>
      {state === 'error' && (
        <div className="mt-4">
          <InlineAlert tone="error" title="We couldn’t delete your portrait">
            Nothing was removed. Check your connection and try again.
          </InlineAlert>
        </div>
      )}
    </Dialog>
  );
}

