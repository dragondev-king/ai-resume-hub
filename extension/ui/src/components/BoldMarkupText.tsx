import React from 'react';
import { parseBoldMarkup } from '../lib/boldText';

export default function BoldMarkupText({ text }: { text: string }) {
  return (
    <>
      {parseBoldMarkup(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <React.Fragment key={i}>{seg.text}</React.Fragment>
      )}
    </>
  );
}
