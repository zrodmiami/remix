// This interface is intended to be extended by users via module augmentation so
// that they they opt into a runtime future flag they can also opt into any
// updated types for that flag's behavior.  Not every future runtime `FutureConfig`
// flag will have a corresponding entry in here.
//
// For typechecking/testing, you can uncomment either of the following lines,
// but they should remain commented out when committed.  You may need to run
// `pnpm clean:build` after changing this to remove old .d.ts files
export interface Future {
  // v3_singleFetch: true;
  // unstable_alignRouteSignatures: true;
}
