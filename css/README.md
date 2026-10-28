# CSS notes

`styles.css` at the repository root is the **authoritative** stylesheet for Solar Load Reader Mark II (Night Grid theme).

The files under this folder named like `styles-part-*.css` (and any Night Grid split/concat leftovers) are **optional**. They may remain as historical or tooling artifacts; they are not required for the app to load styles.

Always edit and ship `../styles.css`. Do not replace the root stylesheet with `@import` stubs that only re-export part files.
