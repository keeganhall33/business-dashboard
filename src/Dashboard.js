import React, { useEffect, useState } from 'react';
import { Container, Grid, Paper, Typography } from '@mui/material';
import { Chart } from 'react-google-charts';

import { supabase } from './lib/supabaseClient';

const Dashboard = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        console.log('Fetching data...');

        const { data: gaData, error: gaError } = await supabase.from('ga4_data').select('*');
        if (gaError) console.error('GA4 Error:', gaError);
        console.log('GA Data:', gaData);
        const { data: funnelData, error: funnelError } = await supabase.from('funnelkit_data').select('*');
        if (funnelError) console.error('FunnelKit Error:', funnelError);
        console.log('Funnel Data:', funnelData);
        const { data: wooData, error: wooError } = await supabase.from('woocommerce_data').select('*');
        if (wooError) console.error('WooCommerce Error:', wooError);
        console.log('Woo Data:', wooData);

        const processedData = [
            ['Source', 'Visitors'],
            ['GA4', gaData ? gaData.length : 0],
            ['FunnelKit', funnelData ? funnelData.length : 0],
            ['WooCommerce', wooData ? wooData.length : 0]
        ];
        setData(processedData);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    return (
        <Container>
            <Typography variant='h4'>Business Dashboard</Typography>
            {loading ? (
                <Typography variant='body1'>Loading data...</Typography>
            ) : (
                <Grid container spacing={2}>
                    <Grid item xs={12}><Paper><Chart chartType='PieChart' data={data} width='100%' height='400px' /></Paper></Grid>
                </Grid>
            )}
        </Container>
    );
};

export default Dashboard;
