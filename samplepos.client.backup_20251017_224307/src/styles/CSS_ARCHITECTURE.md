# CSS Architecture Documentation

## Overview

This project uses a modular CSS architecture based on variables and utility classes. The system is designed to provide consistent styling throughout the application while maintaining flexibility and ease of maintenance.

## CSS Files Structure

Our CSS is organized into several files, each with a specific purpose:

1. **variables.css** - Design tokens and theming variables
2. **typography.css** - Text styling and utility classes
3. **layout.css** - Layout utilities including spacing, grid, and flex
4. **buttons.css** - Button styles and variations
5. **forms.css** - Form element styling
6. **tables.css** - Table styling and utilities
7. **responsive.css** - Media queries and responsive adjustments
8. **helpers.css** - Backward compatibility classes

These files are imported in App.tsx in this specific order to ensure proper cascade and inheritance.

## Design Tokens (Variables)

All design tokens are centralized in `variables.css` and follow this naming convention:

```css
--category-variant: value;
```

Examples:
- `--color-primary`: Primary brand color
- `--space-md`: Medium spacing value
- `--font-size-lg`: Large font size

## Utility Classes

Utility classes follow a consistent naming convention:

```
.[property]-[value]
```

Examples:
- `.w-half`: Width 50%
- `.m-sm`: Margin small
- `.text-center`: Text aligned center
- `.flex-row`: Flex direction row

## Components

Component-specific styling is contained in separate CSS files named after the component. These component styles leverage the variables from `variables.css` to maintain consistency.

## Backward Compatibility

The `helpers.css` file provides backward compatibility for older components that haven't been updated to use the new CSS framework.

## Best Practices

1. **Always use variables** for colors, spacing, shadows, etc. instead of hard-coded values
2. **Use utility classes** for common styling needs
3. **Keep component-specific CSS** to a minimum
4. **Maintain responsive design** by using the breakpoint variables
5. **Document complex CSS** with comments

## Media Queries

Media queries are organized in `responsive.css` and use these breakpoint variables:

```css
--breakpoint-sm: 576px;
--breakpoint-md: 768px;
--breakpoint-lg: 992px;
--breakpoint-xl: 1200px;
```

Use them like this:

```css
@media (max-width: var(--breakpoint-md)) {
  /* Styles for medium screens and smaller */
}
```