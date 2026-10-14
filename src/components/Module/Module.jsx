import React from 'react';
import PropTypes from 'prop-types';
import { ComponentContainer, Bolt, Label } from './Module.styled';

const BASE_CLASS_NAME = 'Module';

const Module = ({ className = '', children = null, columns, gap, label = '', rows }) => (
    <ComponentContainer className={`${BASE_CLASS_NAME} ${className}`.trim()}>
        <Bolt />
        <Bolt />
        <Bolt />
        <Bolt />
        {label && <Label className={`${BASE_CLASS_NAME}__Label`}>{label}</Label>}
        {children}
    </ComponentContainer>
);

Module.propTypes = {
    className: PropTypes.string,
    children: PropTypes.node,
    label: PropTypes.string,
};


export default Module;
