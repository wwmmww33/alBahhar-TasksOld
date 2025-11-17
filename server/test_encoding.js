const sql = require('mssql');
const config = require('./src/config/db.config');

async function testEncoding() {
    try {
        console.log('Testing database encoding...');
        
        // Connect to database
        const dbConfig = config.development || config;
        await sql.connect(dbConfig);
        console.log('Database connected with Arabic language support');
        
        // Test query with different encoding approaches
        const result = await sql.query`
            SET LANGUAGE Arabic;
            SELECT 
                CategoryID,
                Name COLLATE Arabic_100_CI_AS_SC_UTF8 as Name,
                Description COLLATE Arabic_100_CI_AS_SC_UTF8 as Description,
                CAST(Name AS NVARCHAR(100)) COLLATE Arabic_100_CI_AS_SC_UTF8 as NameCast,
                CONVERT(NVARCHAR(100), Name) COLLATE Arabic_100_CI_AS_SC_UTF8 as NameConvert
            FROM Categories 
            WHERE CategoryID = 4
        `;
        
        console.log('Raw result:', JSON.stringify(result.recordset, null, 2));
        
        // Test buffer conversion
        if (result.recordset.length > 0) {
            const record = result.recordset[0];
            console.log('\nBuffer test:');
            console.log('Name as Buffer:', Buffer.from(record.Name, 'utf8'));
            console.log('Name as Buffer:', Buffer.from(record.Name));
            console.log('Name as String:', record.Name);
            console.log('Name length:', record.Name.length);
            
            // Try different decoding approaches
            console.log('\nDecoding attempts:');
            console.log('Latin1 to UTF8:', Buffer.from(record.Name, 'latin1').toString('utf8'));
            console.log('Binary to UTF8:', Buffer.from(record.Name, 'binary').toString('utf8'));
        }
        
        // Test direct SQL query with proper encoding
        console.log('\nTesting direct query with encoding settings:');
        const result2 = await sql.query`
            DECLARE @name NVARCHAR(100);
            SELECT @name = Name FROM Categories WHERE CategoryID = 4;
            SELECT @name as DirectName, LEN(@name) as DirectLength, DATALENGTH(@name) as DirectDataLength;
        `;
        
        console.log('Direct query result:', JSON.stringify(result2.recordset, null, 2));
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

testEncoding();