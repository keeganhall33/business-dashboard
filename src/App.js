import React from 'react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Dashboard from './Dashboard';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#F97316',
        },
        secondary: {
            main: '#22d3ee',
        },
        background: {
            default: '#04070F',
            paper: '#0B1524',
        },
        text: {
            primary: '#F8FAFC',
            secondary: '#94A3B8',
        },
    },
    shape: {
        borderRadius: 18,
    },
    typography: {
        fontFamily: '"Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        h4: { fontWeight: 600 },
        h5: { fontWeight: 600 },
        button: { fontWeight: 600 },
    },
});

const App = () => {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Dashboard />
        </ThemeProvider>
    );
};

export default App;
