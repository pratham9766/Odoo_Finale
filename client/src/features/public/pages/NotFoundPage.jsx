import { Result, Button } from 'antd';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-appbg">
      <Result
        status="404"
        title="Page not found"
        subTitle="The page you're looking for doesn't exist or you don't have access to it."
        extra={<Link to="/"><Button type="primary">Go home</Button></Link>}
      />
    </div>
  );
}
