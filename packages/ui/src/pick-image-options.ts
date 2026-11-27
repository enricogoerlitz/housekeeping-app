/** How the image picker opens (spec 0039). */
export interface PickImageOptions {
  /** Straight into the camera ("Foto aufnehmen") instead of the library or files. */
  camera?: boolean;
  /** The file types offered (default `image/*`); spec 0067: photos and PDF for the agent. */
  accept?: string;
}
