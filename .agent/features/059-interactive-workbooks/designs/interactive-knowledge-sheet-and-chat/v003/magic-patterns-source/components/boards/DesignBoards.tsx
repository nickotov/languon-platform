import React from 'react';
import type { BoardId } from '../document/DocPrototypeControls';
import { BlockRuntimeProvider } from '../../contexts/BlockRuntimeContext';
import { BlockGallery } from './BlockGallery';
import { StateBoard } from './StateBoard';
import { FutureBoard } from './FutureBoard';
import { RequirementsMap } from './RequirementsMap';

/** Design boards reached from the Prototype panel. They sit above the workspace, which stays mounted. */
export function DesignBoards({ board, mobile }: { board: Exclude<BoardId, 'workspace'>; mobile: boolean }) {
  return (
    <div className="absolute inset-0 z-40 bg-background-canvas">
      <BlockRuntimeProvider touch={mobile} speechUnavailable={false} aiCheckFails={false}>
        {board === 'gallery' && <BlockGallery mobile={mobile} />}
        {board === 'states' && <StateBoard mobile={mobile} />}
        {board === 'future' && <FutureBoard mobile={mobile} />}
        {board === 'map' && <RequirementsMap mobile={mobile} />}
      </BlockRuntimeProvider>
    </div>
  );
}

