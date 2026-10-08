import React from 'react';

const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element') || Symbol.for('react.element');
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
const REACT_PORTAL_TYPE = Symbol.for('react.portal');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_MEMO_TYPE = Symbol.for('react.memo');

export const Element = REACT_ELEMENT_TYPE;
export const Fragment = REACT_FRAGMENT_TYPE;
export const Portal = REACT_PORTAL_TYPE;
export const ForwardRef = REACT_FORWARD_REF_TYPE;
export const Memo = REACT_MEMO_TYPE;

export function isFragment(object: any): boolean {
  return typeof object === 'object' && object !== null && object.type === REACT_FRAGMENT_TYPE;
}

export function isElement(object: any): boolean {
  return React.isValidElement(object);
}

export function isMemo(object: any): boolean {
  return typeof object === 'object' && object !== null && object.$$typeof === REACT_MEMO_TYPE;
}

export function isForwardRef(object: any): boolean {
  return typeof object === 'object' && object !== null && object.$$typeof === REACT_FORWARD_REF_TYPE;
}

export function isPortal(object: any): boolean {
  return typeof object === 'object' && object !== null && object.$$typeof === REACT_PORTAL_TYPE;
}

export function isValidElementType(type: any): boolean {
  return (
    typeof type === 'string' ||
    typeof type === 'function' ||
    type === REACT_FRAGMENT_TYPE ||
    type === REACT_PORTAL_TYPE ||
    (typeof type === 'object' &&
      type !== null &&
      (type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE))
  );
}

export default {
  Element,
  Fragment,
  Portal,
  ForwardRef,
  Memo,
  isFragment,
  isElement,
  isMemo,
  isForwardRef,
  isPortal,
  isValidElementType,
};
