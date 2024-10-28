// This interface is intended to be extended by users via module augmentation so
// that they they opt into a runtime future flag they can also opt into any
// updated types for that flag's behavior.  Not every future runtime `FutureConfig`
// flag will have a corresponding entry in here.
export interface Future {
  v3_singleFetch?: false;
  unstable_alignRouteSignatures?: false;
}
