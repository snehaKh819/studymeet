import {Tldraw} from 'tldraw';
import 'tldraw/tldraw.css';
import './whiteboard.css';

function Whiteboard(){
    return(
        <div className="whiteboard">
            <Tldraw/>
        </div>
    );
}

export default Whiteboard;