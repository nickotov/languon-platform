import { defineConfig } from 'tsup';

export default defineConfig({
    dts: {
        // The build script runs full strict typechecking before declaration emit.
        // Avoid repeating that semantic analysis inside the bounded DTS worker.
        // tsup otherwise requests declaration diagnostics for every internal
        // module before emitting each entry. Validate emitted declarations here;
        // the preceding typecheck owns whole-program semantic diagnostics.
        compilerOptions: { noCheck: true, noEmitOnError: false },
    },
});
